/**
 * Open tabs of the desk keep each other up to date at once: a basket one tab
 * receives from Picnic, a list saved, a pick made, a product starred, signing
 * in or out. They talk over the browser's BroadcastChannel, which reaches the
 * desk's other tabs and windows in this browser only.
 *
 * Every tab is the same Home Assistant site, so nothing passes here that the
 * other tabs could not ask the app for themselves.
 */
import type { CartData } from "@/lib/core/types";

import type { Picks, SavedProduct, ShoppingList } from "../../server/desk-routes";

export type SyncMessage =
  | { type: "cart"; cart: CartData }
  | { type: "lists"; lists: ShoppingList[] }
  | { type: "picks"; picks: Picks }
  | { type: "starred"; products: SavedProduct[] }
  | { type: "session" };

type Handler<T extends SyncMessage["type"]> = (message: Extract<SyncMessage, { type: T }>) => void;

const handlers = new Map<SyncMessage["type"], Set<(message: SyncMessage) => void>>();

let channel: BroadcastChannel | null = null;
try {
  channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("picnic-desk");
  // Node has BroadcastChannel too (the tests load this file): there it must not keep the process running.
  (channel as { unref?: () => void } | null)?.unref?.();
  channel?.addEventListener("message", (event: MessageEvent<SyncMessage>) => {
    const message = event.data;
    if (!message || typeof message !== "object" || typeof message.type !== "string") return;
    handlers.get(message.type)?.forEach((handle) => handle(message));
  });
} catch {
  channel = null; // not available: each tab catches up when it is looked at again
}

/** Tell the other tabs (never this one). */
export function tell(message: SyncMessage): void {
  try {
    channel?.postMessage(message);
  } catch {
    // a message that cannot be copied is not worth breaking the page for
  }
}

/** Hear from the other tabs; returns a function that stops listening. */
export function hear<T extends SyncMessage["type"]>(type: T, handle: Handler<T>): () => void {
  const set = handlers.get(type) ?? new Set();
  const wrapped = handle as (message: SyncMessage) => void;
  set.add(wrapped);
  handlers.set(type, set);
  return () => set.delete(wrapped);
}
