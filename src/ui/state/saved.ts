/**
 * Starred products (kept by this app, in saved.json) and saved recipes (kept
 * by Picnic, on the account). Both change at once on screen and roll back
 * when the server says no.
 */
import { useEffect, useSyncExternalStore } from "react";

import type { SavedRecipesApiResponse } from "@/lib/core/types";

import type { SavedProduct } from "../../server/desk-routes";
import { api } from "../lib/api";
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

// ─── Starred products ────────────────────────────────────────────────────────

const starred = new Store<SavedProduct[] | null>(null);
let starredLoading: Promise<void> | null = null;

function loadStarred(force = false): Promise<void> {
  if (starred.value && !force) return Promise.resolve();
  starredLoading ??= api<{ products: SavedProduct[] }>("desk/saved").then((result) => {
    starredLoading = null;
    if (result.ok && Array.isArray(result.data?.products)) starred.set(result.data.products);
    else if (!starred.value) starred.set([]);
  });
  return starredLoading;
}

export function useStarred(): SavedProduct[] | null {
  useEffect(() => void loadStarred(), []);
  return useSyncExternalStore(starred.subscribe, starred.get);
}

export async function toggleStar(product: SavedProduct, onError: (message: string) => void): Promise<void> {
  const before = starred.value ?? [];
  const isStarred = before.some((p) => p.id === product.id);
  starred.set(isStarred ? before.filter((p) => p.id !== product.id) : [product, ...before]);
  const result = await api<{ products: SavedProduct[] }>("desk/saved", { method: "POST", body: { product } });
  if (result.ok && Array.isArray(result.data?.products)) {
    starred.set(result.data.products);
    tell({ type: "starred", products: result.data.products });
  } else if (result.ok) void loadStarred(true);
  else {
    starred.set(before);
    onError(result.error);
  }
}

// ─── Saved recipes ───────────────────────────────────────────────────────────

const savedRecipes = new Store<ReadonlySet<string>>(new Set());
let savedRecipesLoaded = false;
/** Changes per recipe go one after the other; the last one wins. */
const recipeQueue = new Map<string, Promise<void>>();

export function useSavedRecipes(): ReadonlySet<string> {
  useEffect(() => {
    if (savedRecipesLoaded) return;
    savedRecipesLoaded = true;
    void api<SavedRecipesApiResponse>("recipe/saved").then((result) => {
      if (result.ok && Array.isArray(result.data?.recipeIds)) savedRecipes.set(new Set(result.data.recipeIds));
      else savedRecipesLoaded = false;
    });
  }, []);
  return useSyncExternalStore(savedRecipes.subscribe, savedRecipes.get);
}

export function toggleSavedRecipe(recipeId: string, onError: (message: string) => void): void {
  const next = new Set(savedRecipes.value);
  const saved = !next.has(recipeId);
  if (saved) next.add(recipeId);
  else next.delete(recipeId);
  savedRecipes.set(next);
  const previous = recipeQueue.get(recipeId) ?? Promise.resolve();
  const run = previous.then(async () => {
    const result = await api<{ saved: boolean }>(`recipe/${encodeURIComponent(recipeId)}/save`, {
      method: "POST",
      body: { saved },
    });
    if (!result.ok) {
      const rolled = new Set(savedRecipes.value);
      if (saved) rolled.delete(recipeId);
      else rolled.add(recipeId);
      savedRecipes.set(rolled);
      onError(result.error);
    }
  });
  recipeQueue.set(recipeId, run);
}

/** After signing out nothing of the old account may show. */
export function forgetSaved(): void {
  savedRecipes.set(new Set());
  savedRecipesLoaded = false;
}

// A product starred in another tab shows starred here at once.
hear("starred", (message) => starred.set(message.products));
