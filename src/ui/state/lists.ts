/**
 * Lists (a basket kept for another time) and the picks of a pasted list (the
 * product chosen for "havermelk" last time). Both are kept by the app's
 * server, shared by every browser; they change on screen at once and go back
 * when the server says no.
 */
import { useEffect, useSyncExternalStore } from "react";

import type { CartItem } from "@/lib/core/types";

import type { ListItem, Picks, SavedProduct, ShoppingList } from "../../server/desk-routes";
import { api } from "../lib/api";
import type { Wanted } from "./cart";
import { hear, tell } from "./sync";

class Store<T> {
  value: T;
  #listeners = new Set<() => void>();
  constructor(initial: T) {
    this.value = initial;
  }
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  get = () => this.value;
  set(value: T) {
    this.value = value;
    this.#listeners.forEach((l) => l());
  }
}

// ─── Lists ───────────────────────────────────────────────────────────────────

const lists = new Store<ShoppingList[] | null>(null);
let listsLoading: Promise<void> | null = null;

function loadLists(): Promise<void> {
  listsLoading ??= api<{ lists: ShoppingList[] }>("desk/lists").then((result) => {
    listsLoading = null;
    lists.set(result.ok && Array.isArray(result.data?.lists) ? result.data.lists : (lists.value ?? []));
  });
  return listsLoading;
}

export function useLists(): ShoppingList[] | null {
  useEffect(() => {
    if (!lists.value) void loadLists();
  }, []);
  return useSyncExternalStore(lists.subscribe, lists.get);
}

/** Replace all lists; on refusal the old ones come back and the error is returned. */
export async function saveLists(next: ShoppingList[]): Promise<string | null> {
  const before = lists.value ?? [];
  lists.set(next);
  const result = await api<{ lists: ShoppingList[] }>("desk/lists", { method: "PUT", body: { lists: next } });
  if (result.ok && Array.isArray(result.data?.lists)) {
    lists.set(result.data.lists);
    tell({ type: "lists", lists: result.data.lists });
    return null;
  }
  lists.set(before);
  return result.ok ? "?" : result.error;
}

export const snapshot = (item: Pick<CartItem, "productId" | "name" | "imageId" | "unitQuantity" | "displayPrice">): SavedProduct => ({
  id: item.productId,
  name: item.name,
  imageId: item.imageId ?? "",
  unitQuantity: item.unitQuantity ?? "",
  displayPrice: item.displayPrice,
});

/** The basket as list items: what is available, one line per product (recipe lines added up). */
export function itemsFromBasket(items: CartItem[]): ListItem[] {
  const byId = new Map<string, ListItem>();
  for (const item of items) {
    if (item.isUnavailable || item.quantity < 1) continue;
    const known = byId.get(item.productId);
    // A cart line's price is for all of its units; a list keeps the price of one.
    const each = { ...snapshot(item), displayPrice: Math.round(item.displayPrice / item.quantity) };
    byId.set(item.productId, {
      product: known?.product ?? each,
      count: Math.min(99, (known?.count ?? 0) + item.quantity),
      maxCount: Math.max(1, Math.min(999, item.maxCount)),
    });
  }
  return [...byId.values()];
}

export const wantedFromList = (list: ShoppingList): Wanted[] =>
  list.items.map((item) => ({ productId: item.product.id, count: item.count, maxCount: item.maxCount }));

export function newListId(): string {
  return `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Picks ───────────────────────────────────────────────────────────────────

const picks = new Store<Picks | null>(null);
let picksLoading: Promise<void> | null = null;

export function usePicks(): Picks | null {
  useEffect(() => {
    if (picks.value || picksLoading) return;
    picksLoading = api<{ picks: Picks }>("desk/picks").then((result) => {
      picksLoading = null;
      picks.set(result.ok && result.data?.picks && typeof result.data.picks === "object" ? result.data.picks : {});
    });
  }, []);
  return useSyncExternalStore(picks.subscribe, picks.get);
}

/** The same words the server keys picks by: lower case, single spaces. */
export const pickTerm = (words: string) => words.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);

/** Remember (or with null forget) the product chosen for a line's words. */
export async function setPick(words: string, product: SavedProduct | null): Promise<void> {
  const term = pickTerm(words);
  if (!term) return;
  const before = picks.value ?? {};
  if (product && before[term]?.id === product.id) return;
  const next = { ...before };
  if (product) next[term] = product;
  else delete next[term];
  picks.set(next);
  const result = await api<{ picks: Picks }>("desk/picks", { method: "PUT", body: { term, product } });
  if (result.ok && result.data?.picks) {
    picks.set(result.data.picks);
    tell({ type: "picks", picks: result.data.picks });
  } else picks.set(before);
}

// What another tab saved shows here at once.
hear("lists", (message) => lists.set(message.lists));
hear("picks", (message) => picks.set(message.picks));
