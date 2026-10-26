/**
 * Adding to an order already placed. When the basket's delivery time is the
 * time of an order you placed and Picnic has not started on yet, Picnic adds
 * the basket to that order, and the minimum order does not apply to it: the
 * Picnic app lets you check out any amount then. Picnic still decides when
 * the order is placed.
 */
import type { DeliveryListItem } from "@/lib/core/delivery-types";

type Window = { windowStart?: string | null; windowEnd?: string | null };

const same = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return false;
  const [x, y] = [Date.parse(a), Date.parse(b)];
  return Number.isFinite(x) && x === y;
};

/** The current order delivered at the same time as `slot`, if there is one. */
export function orderAtSameTime(slot: Window | null | undefined, orders: readonly DeliveryListItem[] | null): DeliveryListItem | null {
  if (!slot || !orders) return null;
  return (
    orders.find(
      (order) =>
        order.status === "CURRENT" &&
        same(order.windowStart, slot.windowStart) &&
        (!order.windowEnd || !slot.windowEnd || same(order.windowEnd, slot.windowEnd))
    ) ?? null
  );
}
