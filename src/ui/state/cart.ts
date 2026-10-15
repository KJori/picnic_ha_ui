/**
 * The basket, shared by every part of the page.
 *
 * Changes show at once and are sent in the background. Clicks on one product
 * are merged: while a change for it is on its way, further clicks add up and
 * go as one request (Picnic's add and remove calls take a count). Different
 * products go in parallel. Each answer is the whole basket; an answer older
 * than one already shown is not shown. When a change fails, the basket is
 * fetched again, so what is shown is what Picnic has. Answers to requests sent
 * before the basket was emptied or the account changed are ignored.
 */
import { useSyncExternalStore } from "react";

import type { CartData, CartItem } from "@/lib/core/types";

import { api, type Result } from "../lib/api";

type CartStatus = "loading" | "ready" | "error";

type Send = (productId: string, action: "add" | "remove", count: number) => Promise<Result<CartData>>;

const defaultSend: Send = (productId, action, count) =>
  api<CartData>("cart", { method: "POST", body: { productId, action, count } });

export class CartModel {
  cart: CartData | null = null;
  status: CartStatus = "loading";
  error: string | null = null;
  /** Product id → change not yet confirmed by Picnic. */
  readonly #pending = new Map<string, number>();
  /** Product id → change waiting for the request in flight to finish. */
  readonly #queued = new Map<string, number>();
  readonly #inFlight = new Set<string>();
  readonly #listeners = new Set<() => void>();
  #sent = 0;
  #shown = 0;
  #version = 0;
  #snapshot: { version: number } = { version: 0 };
  #refreshing: Promise<void> | null = null;
  /** Goes up when the basket is emptied or forgotten; older answers no longer count. */
  #epoch = 0;
  onError: (message: string) => void = () => {};

  constructor(
    private readonly send: Send = defaultSend,
    private readonly load: () => Promise<Result<CartData>> = () => api<CartData>("cart"),
    private readonly empty: () => Promise<Result<CartData>> = () => api<CartData>("cart", { method: "DELETE" })
  ) {}

  // ─── Reading ──────────────────────────────────────────────────────────────

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = () => this.#snapshot;

  #emit() {
    this.#version += 1;
    this.#snapshot = { version: this.#version };
    this.#listeners.forEach((l) => l());
  }

  /** The amount shown for a product: Picnic's, plus what is on its way. */
  quantity(productId: string): number {
    // A product can sit on more than one line, e.g. once for a recipe and once on its own.
    const confirmed = (this.cart?.items ?? [])
      .filter((item) => item.productId === productId && !item.isUnavailable)
      .reduce((sum, item) => sum + item.quantity, 0);
    return Math.max(0, confirmed + (this.#pending.get(productId) ?? 0));
  }

  line(productId: string): CartItem | undefined {
    return this.cart?.items.find((item) => item.productId === productId && !item.isUnavailable);
  }

  get busy(): boolean {
    return this.#pending.size > 0;
  }

  /** Item count with the changes on their way included. */
  get count(): number {
    let delta = 0;
    this.#pending.forEach((d) => (delta += d));
    return Math.max(0, (this.cart?.totalCount ?? 0) + delta);
  }

  // ─── Changing ─────────────────────────────────────────────────────────────

  add(productId: string, maxCount = 99, count = 1): void {
    const room = Math.max(0, maxCount - this.quantity(productId));
    this.#change(productId, Math.min(count, room));
  }

  remove(productId: string, count = 1): void {
    this.#change(productId, -Math.min(count, this.quantity(productId)));
  }

  set(productId: string, target: number, maxCount = 99): void {
    const wanted = Math.max(0, Math.min(maxCount, Math.floor(target)));
    this.#change(productId, wanted - this.quantity(productId));
  }

  #change(productId: string, delta: number): void {
    if (!delta) return;
    this.#pending.set(productId, (this.#pending.get(productId) ?? 0) + delta);
    this.#queued.set(productId, (this.#queued.get(productId) ?? 0) + delta);
    this.#emit();
    void this.#flush(productId);
  }

  async #flush(productId: string): Promise<void> {
    if (this.#inFlight.has(productId)) return;
    const delta = this.#queued.get(productId) ?? 0;
    this.#queued.delete(productId);
    if (!delta) return;

    this.#inFlight.add(productId);
    const order = ++this.#sent;
    const epoch = this.#epoch;
    let result: Result<CartData>;
    try {
      result = await this.send(productId, delta > 0 ? "add" : "remove", Math.abs(delta));
    } catch {
      result = { ok: false, status: 0, error: "network" };
    }
    this.#inFlight.delete(productId);
    if (epoch !== this.#epoch) {
      // The basket was emptied or forgotten meanwhile: what this was based on is gone.
      if (this.#queued.has(productId)) void this.#flush(productId);
      return;
    }

    const left = (this.#pending.get(productId) ?? 0) - delta;
    if (left) this.#pending.set(productId, left);
    else this.#pending.delete(productId);

    if (result.ok) {
      if (order > this.#shown) {
        this.#shown = order;
        this.#accept(result.data);
      }
    } else {
      this.onError(result.error);
      // What is queued for this product was based on the change that failed.
      const queued = this.#queued.get(productId) ?? 0;
      this.#queued.delete(productId);
      const rest = (this.#pending.get(productId) ?? 0) - queued;
      if (rest) this.#pending.set(productId, rest);
      else this.#pending.delete(productId);
      void this.refresh();
    }
    this.#emit();
    if (this.#queued.has(productId)) void this.#flush(productId);
    else if (!this.busy && order < this.#shown) void this.refresh(); // an answer was skipped: settle on Picnic's state
  }

  #accept(cart: CartData): void {
    this.cart = cart;
    this.status = "ready";
    this.error = null;
  }

  /** Take a basket Picnic sent with another answer (slot choice, recipe add). */
  accept(cart: CartData): void {
    this.#shown = this.#sent;
    this.#accept(cart);
    this.#emit();
  }

  refresh(): Promise<void> {
    this.#refreshing ??= (async () => {
      const startedAt = this.#sent;
      const epoch = this.#epoch;
      const result = await this.load().catch(() => ({ ok: false, status: 0, error: "network" }) as const);
      this.#refreshing = null;
      if (epoch !== this.#epoch) return; // for an account or basket that is gone
      if (result.ok) {
        // A change sent after this request started knows better.
        if (this.#sent === startedAt && !this.busy) {
          this.#shown = this.#sent;
          this.#accept(result.data);
        } else if (!this.cart) {
          this.#accept(result.data);
        }
      } else if (!this.cart) {
        this.status = "error";
        this.error = result.error;
      }
      this.#emit();
    })();
    return this.#refreshing;
  }

  async clear(): Promise<boolean> {
    const result = await this.empty();
    if (result.ok) {
      this.#epoch += 1;
      this.#pending.clear();
      this.#queued.clear();
      this.accept(result.data);
      return true;
    }
    this.onError(result.error);
    return false;
  }

  /** Forget everything, e.g. after signing out. */
  reset(): void {
    this.#epoch += 1;
    this.#refreshing = null;
    this.cart = null;
    this.status = "loading";
    this.error = null;
    this.#pending.clear();
    this.#queued.clear();
    this.#emit();
  }
}

export const cartModel = new CartModel();

/** Re-render when the basket changes; returns the model. */
export function useCart(): CartModel {
  useSyncExternalStore(cartModel.subscribe, cartModel.getSnapshot);
  return cartModel;
}
