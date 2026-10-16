/**
 * The order results are shown in, the same on every screen and kept in this
 * browser (a convenience, cleared on signing out like the page's other data).
 */
import { useSyncExternalStore } from "react";

import type { SortOrder } from "../lib/unit-price";

const SORT_KEY = "picnic_desk_sort";
const sortListeners = new Set<() => void>();
let sortOrder: SortOrder = (() => {
  try {
    const kept = localStorage.getItem(SORT_KEY);
    return kept === "price" || kept === "unit" ? kept : "picnic";
  } catch {
    return "picnic";
  }
})();

/** The chosen order, the same on every screen and kept in this browser. */
export function useSortOrder(): SortOrder {
  return useSyncExternalStore(
    (listener) => {
      sortListeners.add(listener);
      return () => sortListeners.delete(listener);
    },
    () => sortOrder,
    () => "picnic"
  );
}

export function setSortOrder(order: SortOrder): void {
  sortOrder = order;
  try {
    localStorage.setItem(SORT_KEY, order);
  } catch {
    // kept for this page only
  }
  sortListeners.forEach((l) => l());
}
