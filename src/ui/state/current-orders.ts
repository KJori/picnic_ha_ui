/**
 * Picnic's current orders (placed, not yet delivered), shared by the desk's
 * "your order arrives" bar and whoever needs to look again (after placing or
 * cancelling an order). Looked at when the desk opens, when coming back to
 * the tab, and every few minutes while it is shown.
 */
import { useEffect, useSyncExternalStore } from "react";

import type { DeliveriesApiResponse, DeliveryListItem } from "@/lib/core/delivery-types";

import { api } from "../lib/api";

const ORDERS_EVERY_MS = 5 * 60 * 1000;
const AGAIN_ON_RETURN_MS = 60 * 1000;

let current: DeliveryListItem[] | null = null;
let loading: Promise<void> | null = null;
let lastLoaded = 0;
const listeners = new Set<() => void>();

/** Look at Picnic's current orders again (also after placing one). */
export function refreshCurrentOrders(): Promise<void> {
  loading ??= api<DeliveriesApiResponse>("deliveries?status=CURRENT").then((result) => {
    loading = null;
    lastLoaded = Date.now();
    if (!result.ok) return; // keep what was shown
    const list = Array.isArray(result.data?.deliveries) ? result.data.deliveries : [];
    current = list.filter((d) => d && d.status === "CURRENT" && d.id);
    listeners.forEach((l) => l());
  });
  return loading;
}

export function useCurrentOrders(): DeliveryListItem[] | null {
  useEffect(() => {
    if (!current) void refreshCurrentOrders();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refreshCurrentOrders();
    }, ORDERS_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoaded > AGAIN_ON_RETURN_MS) void refreshCurrentOrders();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current
  );
}

/** Forget them, e.g. after signing out. */
export function forgetCurrentOrders(): void {
  current = null;
  listeners.forEach((l) => l());
}

