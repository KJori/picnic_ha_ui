/**
 * The payment in progress, kept by the server.
 *
 * After paying at the bank, Picnic only takes the order once it is confirmed
 * (picnic-web's checkout ends with POST /cart/checkout/confirm). The page
 * confirms it when it sees the payment finish, but the page may be gone by
 * then: the tab closed, the laptop asleep, or the app restarted. So the
 * server remembers the payment from the moment it starts, in payment.json,
 * asks Picnic about it every little while, and confirms it itself. Every page,
 * on every device, sees the open payment in /api/desk/state.
 *
 * Confirming goes through here, one at a time: the page's tabs and the server
 * never confirm the same order twice, and a second ask gets the first answer.
 *
 * When a confirmation fails, the order may still have been placed (Picnic
 * took it, but its answer came too late). Picnic's current deliveries are
 * noted when the payment starts; a delivery that is new afterwards, or that
 * has one more order, counts as the order having been placed.
 */
import { NextResponse, type NextRequest } from "next/server";

import type { DeliveriesApiResponse } from "@/lib/core/delivery-types";

import type { InternalResult } from "./app";
import { isObject, type Store } from "./store";

const FILE = "payment.json";
/** How often the server asks Picnic about the payment while it is open. */
export const PAYMENT_POLL_MS = 15_000;
/** After this, the server stops asking; the page says to check the orders. */
export const PAYMENT_WATCH_MS = 2 * 60 * 60 * 1000;
/** Picnic's words for a payment that will not finish. */
export const FAILED_PAYMENT = /CANCEL|FAIL|EXPIR|ERROR|REJECT/i;

/** Delivery id → number of orders in it. */
type Deliveries = Record<string, number>;

type Saved = {
  orderId: string;
  transactionId: string;
  startedAt: number;
  /** Picnic's current deliveries when the payment started; null when Picnic did not say. */
  before: Deliveries | null;
  /** Set when the server stopped asking without an answer either way. */
  gaveUp?: boolean;
};

/** What the page is told about the open payment. */
export type OpenPayment = { orderId: string; transactionId: string; startedAt: number; gaveUp: boolean };

const isDeliveries = (value: unknown): value is Deliveries =>
  isObject(value) && Object.values(value).every((n) => typeof n === "number");

const isSaved = (value: unknown): value is Saved =>
  isObject(value) &&
  typeof value.orderId === "string" &&
  value.orderId !== "" &&
  typeof value.transactionId === "string" &&
  value.transactionId !== "" &&
  typeof value.startedAt === "number" &&
  (value.before === null || isDeliveries(value.before));

type Confirmed = { orderId: string; status: number; body: string };

export type PaymentsHost = {
  store: Store;
  /** Call one of the app's own API routes. */
  internal(path: string, init?: { method?: string; body?: unknown }): Promise<InternalResult>;
  now(): number;
  /** False stops the server from asking Picnic by itself (tests drive it with `tick`). */
  watch: boolean;
};

export class Payments {
  #open: Saved | null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #confirming: { orderId: string; answer: Promise<Confirmed> } | null = null;
  /** The last order confirmed, so a late second ask is answered without asking Picnic again. */
  #confirmed: Confirmed | null = null;
  #ticking: Promise<void> | null = null;

  constructor(private readonly host: PaymentsHost) {
    this.#open = host.store.read<Saved | null>(FILE, null, (value): value is Saved | null => value === null || isSaved(value));
    if (this.#open && !this.#open.gaveUp) this.#schedule();
  }

  get open(): OpenPayment | null {
    if (!this.#open) return null;
    const { orderId, transactionId, startedAt, gaveUp } = this.#open;
    return { orderId, transactionId, startedAt, gaveUp: Boolean(gaveUp) };
  }

  /** The payment for `orderId` started; Picnic gave it `transactionId`. */
  async started(orderId: string, transactionId: string): Promise<void> {
    this.#confirmed = null;
    this.#open = { orderId, transactionId, startedAt: this.host.now(), before: null };
    this.#save();
    this.#schedule();
    const before = await this.#currentDeliveries();
    // Still the same payment (not cancelled or replaced while Picnic answered).
    if (this.#open?.transactionId === transactionId) {
      this.#open = { ...this.#open, before };
      this.#save();
    }
  }

  /** The payment will not finish (cancelled, failed): nothing to confirm. */
  ended(transactionId: string): void {
    if (this.#open?.transactionId === transactionId) this.forget();
  }

  /** Signed out, or the page dismissed a payment the server gave up on. */
  forget(): void {
    this.#open = null;
    this.#confirmed = null;
    this.#stop();
    this.host.store.remove(FILE);
  }

  /**
   * Confirm an order, one at a time. `send` is picnic-web's confirm route.
   * Answers a second ask for the same order with the first answer.
   */
  async confirm(request: NextRequest, send: (request: NextRequest) => Promise<Response>): Promise<Response> {
    let orderId = "";
    try {
      const body: unknown = JSON.parse(await request.text());
      if (isObject(body) && typeof body.orderId === "string") orderId = body.orderId;
    } catch {
      // the route answers an unreadable body itself
    }
    if (!orderId) return send(request);
    if (this.#confirmed?.orderId === orderId) return answer(this.#confirmed);
    if (this.#confirming?.orderId === orderId) return answer(await this.#confirming.answer);

    const run = this.#confirmOnce(orderId, request, send);
    this.#confirming = { orderId, answer: run };
    try {
      return answer(await run);
    } finally {
      if (this.#confirming?.answer === run) this.#confirming = null;
    }
  }

  async #confirmOnce(orderId: string, request: NextRequest, send: (request: NextRequest) => Promise<Response>): Promise<Confirmed> {
    let status = 502;
    let body = JSON.stringify({ error: "Failed to confirm order. Please try again later." });
    try {
      const response = await send(request);
      status = response.status;
      body = await response.text();
    } catch (error) {
      console.error("[desk] confirming the order failed:", error instanceof Error ? error.message : error);
    }
    // Only trouble on Picnic's side (502: no answer, or a garbled one) can hide a placed order;
    // 4xx answers (payment not finished, signed out, bad request) say nothing was placed.
    const placed = (status >= 200 && status < 300) || (status >= 500 && (await this.#placedAnyway(orderId)));
    if (!placed) return { orderId, status, body };

    const confirmed: Confirmed =
      status >= 200 && status < 300 ? { orderId, status, body } : { orderId, status: 200, body: JSON.stringify({ success: true, orderId }) };
    this.#confirmed = confirmed;
    if (this.#open?.orderId === orderId) {
      this.#open = null;
      this.#stop();
      this.host.store.remove(FILE);
    }
    return confirmed;
  }

  /** A confirmation failed: did Picnic take the order all the same? */
  async #placedAnyway(orderId: string): Promise<boolean> {
    const open = this.#open;
    if (!open || open.orderId !== orderId || !open.before) return false;
    const now = await this.#currentDeliveries();
    if (!now) return false;
    return Object.entries(now).some(([id, orders]) => orders > (open.before![id] ?? 0));
  }

  async #currentDeliveries(): Promise<Deliveries | null> {
    try {
      const result = await this.host.internal("deliveries?status=CURRENT");
      if (result.status !== 200 || !isObject(result.body) || !Array.isArray(result.body.deliveries)) return null;
      const deliveries: Deliveries = {};
      for (const delivery of (result.body as unknown as DeliveriesApiResponse).deliveries) {
        if (isObject(delivery) && typeof delivery.id === "string") {
          deliveries[delivery.id] = typeof delivery.orderCount === "number" ? delivery.orderCount : 0;
        }
      }
      return deliveries;
    } catch {
      return null;
    }
  }

  /** Ask Picnic about the open payment once, and confirm it when it is paid. */
  tick(): Promise<void> {
    this.#ticking ??= this.#tick().finally(() => (this.#ticking = null));
    return this.#ticking;
  }

  async #tick(): Promise<void> {
    const open = this.#open;
    if (!open || open.gaveUp) return;
    if (this.host.now() - open.startedAt > PAYMENT_WATCH_MS) {
      this.#open = { ...open, gaveUp: true };
      this.#save();
      this.#stop();
      console.error(`[desk] payment ${open.transactionId}: no answer either way after two hours; check the orders`);
      return;
    }
    const status = await this.host.internal(
      `cart/checkout/status?${new URLSearchParams({ transactionId: open.transactionId })}`
    );
    if (this.#open?.transactionId !== open.transactionId) return;
    const checkoutStatus = isObject(status.body) ? status.body.checkoutStatus : undefined;
    if (status.status !== 200 || typeof checkoutStatus !== "string") return; // ask again next time
    if (FAILED_PAYMENT.test(checkoutStatus)) {
      this.ended(open.transactionId);
      return;
    }
    if (checkoutStatus !== "FINISHED") return;
    const confirmed = await this.host.internal("cart/checkout/confirm", {
      method: "POST",
      body: { orderId: open.orderId, transactionId: open.transactionId },
    });
    if (confirmed.status === 200) console.log(`[desk] order ${open.orderId} confirmed by the app`);
  }

  #schedule(): void {
    if (!this.host.watch || this.#timer) return;
    const next = () => {
      this.#timer = setTimeout(() => {
        void this.tick().finally(() => {
          this.#timer = null;
          if (this.#open && !this.#open.gaveUp) next();
        });
      }, PAYMENT_POLL_MS);
      this.#timer.unref();
    };
    next();
  }

  #stop(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #save(): void {
    if (this.#open) this.host.store.write(FILE, this.#open);
  }
}

const answer = (confirmed: Confirmed): Response =>
  new NextResponse(confirmed.body, { status: confirmed.status, headers: { "content-type": "application/json" } });
