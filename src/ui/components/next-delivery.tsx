/**
 * The order on its way, at the top of the desk, as the Picnic app shows it
 * on its home screen: "Your order arrives tomorrow, 17:00 to 18:00", and once
 * the van is driving "Your order is on its way, expected around 17:24".
 *
 * Orders are looked at when the desk opens, when coming back to the tab, and
 * every few minutes while it is shown. The van is only asked after on the
 * day of delivery, and then every minute (or as often as Picnic says).
 */
import { useEffect, useRef, useState } from "react";

import type { DeliveryListItem, DeliveryTrackingData } from "@/lib/core/delivery-types";
import { parseDeliveryTracking } from "@/lib/delivery/parse-delivery-tracking";

import { api } from "../lib/api";
import { byTime, dayOffset } from "../lib/format";
import { href } from "../lib/router";
import { refreshCurrentOrders, useCurrentOrders } from "../state/current-orders";
import { useT } from "../state/session";
import { useDates } from "./common";

const VAN_EVERY_MS = 60 * 1000;

// ─── The van ─────────────────────────────────────────────────────────────────

/** Where the van is, asked only on the day of delivery; null before that or when Picnic does not say. */
function useVan(order: DeliveryListItem, deliveryDay: boolean): DeliveryTrackingData | null {
  const { country } = useT();
  const [tracking, setTracking] = useState<DeliveryTrackingData | null>(null);
  const last = useRef<DeliveryTrackingData | null>(null);
  useEffect(() => {
    if (!deliveryDay) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = async () => {
      if (document.visibilityState === "visible") {
        const result = await api<unknown>(`deliveries/${encodeURIComponent(order.id)}/position`);
        if (stopped) return;
        if (result.ok) {
          const parsed = parseDeliveryTracking(result.data, null, country);
          // The van stopped driving: delivered, so the order is no longer current.
          if (!parsed.scenarioInProgress && last.current?.scenarioInProgress) void refreshCurrentOrders();
          last.current = parsed;
          setTracking(parsed);
        }
      }
      const pace = last.current?.queryInterval || VAN_EVERY_MS;
      if (!stopped) timer = setTimeout(() => void look(), Math.max(30_000, Math.min(VAN_EVERY_MS, pace)));
    };
    void look();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [order.id, deliveryDay, country]);
  return tracking;
}

// ─── The bar ─────────────────────────────────────────────────────────────────

export function NextDelivery() {
  const orders = useCurrentOrders();
  if (!orders?.length) return null;
  return (
    <div className="next-delivery-bar">
      {[...orders].sort((a, b) => byTime(a.windowStart, b.windowStart)).map((order) => (
        <OrderLine key={order.id} order={order} />
      ))}
    </div>
  );
}

function OrderLine({ order }: { order: DeliveryListItem }) {
  const { t, d } = useT();
  const dates = useDates();
  const offset = dayOffset(order.windowStart, Date.now(), dates.zone);
  const van = useVan(order, offset !== null && offset <= 0);
  const onItsWay = van?.scenarioInProgress === true;

  const day = offset === 0 ? d.today : offset === 1 ? d.tomorrow : dates.day(order.windowStart);
  const window = order.windowStart
    ? `${day}, ${dates.clock(order.windowStart)}${order.windowEnd ? ` ${d.to} ${dates.clock(order.windowEnd)}` : ""}`
    : order.deliveryWindowText;
  const text = onItsWay
    ? van?.eta
      ? d.orderOnItsWay.replace("{time}", dates.clock(van.eta))
      : d.orderOnItsWayNoTime
    : d.orderArrives.replace("{when}", window);
  const count = order.itemCount > 0 ? (order.itemCount === 1 ? d.oneListItem : d.listItemCount.replace("{n}", String(order.itemCount))) : "";

  return (
    <p className={`next-delivery ${onItsWay ? "live" : ""}`} role="status" data-order={order.id}>
      <span className="what">{text}</span>
      {count && <span className="hint-inline">{count}</span>}
      <a href={href(`/orders/${encodeURIComponent(order.id)}`)}>{onItsWay ? t.deliveriesLiveTrack : d.viewOrder}</a>
    </p>
  );
}
