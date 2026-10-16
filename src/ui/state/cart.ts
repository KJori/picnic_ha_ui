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

/** A product to put in the basket in one go (a list, the picks of a pasted list). */
export type Wanted = { productId: string; count: number; maxCount: number };
/** What a bulk change did: the changes that went through (for undo) and the products Picnic refused. */
export type BulkResult = { changed: { productId: string; delta: number }[]; failed: string[] };

/** Products changed at the same time in one go, so a long list does not set off Picnic's rate limit. */
const BULK_AT_ONCE = 3;

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
  /** Another tab changed the basket while this one had changes on their way. */
  #otherTabChanged = false;
  /** Product id → who waits for all its changes to be answered, and whether the last one worked. */
  readonly #waiting = new Map<string, ((ok: boolean) => void)[]>();
  onError: (message: string) => void = () => {};
  /** Called with each basket from Picnic this tab shows (to tell the other tabs). */
  onShown: (cart: CartData) => void = () => {};

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
    if (!delta) {
      this.#settle(productId, true); // clicks that cancelled out: nothing left to send
      return;
    }

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
      else this.#settle(productId, false);
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
    else {
      this.#settle(productId, result.ok);
      if (!this.busy && (order < this.#shown || this.#otherTabChanged)) {
        // An answer was skipped, or another tab changed the basket meanwhile: settle on Picnic's state.
        this.#otherTabChanged = false;
        void this.refresh();
      }
    }
  }

  #settle(productId: string, ok: boolean): void {
    const waiting = this.#waiting.get(productId);
    if (!waiting || this.#inFlight.has(productId) || this.#queued.has(productId)) return;
    this.#waiting.delete(productId);
    waiting.forEach((resolve) => resolve(ok));
  }

  /** Resolves when every change for the product has been answered: true when the last one went through. */
  #answered(productId: string): Promise<boolean> {
    if (!this.#inFlight.has(productId) && !this.#queued.has(productId)) return Promise.resolve(true);
    return new Promise((resolve) => this.#waiting.set(productId, [...(this.#waiting.get(productId) ?? []), resolve]));
  }

  /**
   * Put several products in the basket, a few at a time. With `topUp`, what
   * is already in the basket counts: a list asking for 2 of something that is
   * in the basket once adds 1. Each product keeps to its maximum.
   */
  async addMany(items: Wanted[], { topUp = true }: { topUp?: boolean } = {}): Promise<BulkResult> {
    const result: BulkResult = { changed: [], failed: [] };
    const work = items.filter((item) => item.count > 0);
    let next = 0;
    const worker = async () => {
      while (next < work.length) {
        const item = work[next++];
        const have = this.quantity(item.productId);
        const room = Math.max(0, item.maxCount - have);
        const delta = Math.min(room, topUp ? Math.max(0, item.count - have) : item.count);
        if (!delta) continue;
        this.#change(item.productId, delta);
        if (await this.#answered(item.productId)) result.changed.push({ productId: item.productId, delta });
        else result.failed.push(item.productId);
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_AT_ONCE, work.length) }, worker));
    return result;
  }

  /** Take back what `addMany` did (undo). */
  async takeBack(changed: BulkResult["changed"]): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (next < changed.length) {
        const { productId, delta } = changed[next++];
        const amount = Math.min(delta, this.quantity(productId));
        if (!amount) continue;
        this.#change(productId, -amount);
        await this.#answered(productId);
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_AT_ONCE, changed.length) }, worker));
  }

  #accept(cart: CartData, fromOtherTab = false): void {
    this.cart = cart;
    this.status = "ready";
    this.error = null;
    if (!fromOtherTab) this.onShown(cart);
  }

  /**
   * A basket another tab got from Picnic. Shown at once, unless this tab has
   * changes of its own on their way: then it asks Picnic itself once those
   * are answered, so neither tab's clicks get lost.
   */
  fromOtherTab(cart: CartData): void {
    if (this.busy || this.#inFlight.size > 0) {
      this.#otherTabChanged = true;
      return;
    }
    this.#shown = this.#sent;
    this.#accept(cart, true);
    this.#emit();
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
      this.#settleAll(false);
      this.accept(result.data);
      return true;
    }
    this.onError(result.error);
    return false;
  }

  #settleAll(ok: boolean): void {
    const all = [...this.#waiting.values()];
    this.#waiting.clear();
    all.forEach((waiting) => waiting.forEach((resolve) => resolve(ok)));
  }

  /** Forget everything, e.g. after signing out. */
  reset(): void {
    this.#epoch += 1;
    this.#settleAll(false);
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
