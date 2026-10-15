/**
 * Orders (Picnic calls them deliveries) as a table, one order as a receipt
 * beside its tracking and actions, and the parcel service.
 */
import { useEffect, useRef, useState } from "react";

import type {
  DeliveriesApiResponse,
  DeliveryDetailData,
  DeliveryTrackingData,
  ParcelDetailData,
  ParcelsPageData,
} from "@/lib/core/delivery-types";
import { parseDeliveryTracking } from "@/lib/delivery/parse-delivery-tracking";

import { Lines, Sums } from "../components/basket";
import { Confirm, Hint, Loaded, useDates, useLoad, useMoney, useTitle, useToast } from "../components/common";
import { api } from "../lib/api";
import { back, href, navigate, type Route } from "../lib/router";
import { cartModel } from "../state/cart";
import { useT } from "../state/session";

const TABS = ["", "CURRENT", "COMPLETED", "CANCELLED"] as const;

export function OrdersView({ route }: { route: Route }) {
  const { t, d } = useT();
  const money = useMoney();
  const dates = useDates();
  useTitle(t.deliveriesTitle);
  const status = (TABS as readonly string[]).includes(route.query.get("status") ?? "") ? (route.query.get("status") ?? "") : "";
  const [load, reload] = useLoad<DeliveriesApiResponse>(status, (signal) => api(`deliveries${status ? `?status=${status}` : ""}`, { signal }));
  const [live, setLive] = useState<ReadonlySet<string>>(new Set());

  // Which current orders are on their way, like the app's "Live volgen".
  useEffect(() => {
    if (load.status !== "ready") return;
    const controller = new AbortController();
    const current = load.data.deliveries.filter((x) => x.status === "CURRENT");
    void Promise.all(
      current.map(async (delivery) => {
        const result = await api<{ scenario_in_progress?: boolean }>(`deliveries/${encodeURIComponent(delivery.id)}/position`, {
          signal: controller.signal,
        }).catch(() => null);
        return result?.ok && result.data?.scenario_in_progress === true ? delivery.id : null;
      })
    ).then((ids) => {
      if (!controller.signal.aborted) setLive(new Set(ids.filter((id): id is string => id !== null)));
    });
    return () => controller.abort();
  }, [load]);

  const label = { "": t.deliveriesTabAll, CURRENT: t.deliveriesTabCurrent, COMPLETED: t.deliveriesTabCompleted, CANCELLED: t.deliveriesTabCancelled };
  const empty = { "": t.deliveriesEmptyAll, CURRENT: t.deliveriesEmptyCurrent, COMPLETED: t.deliveriesEmptyCompleted, CANCELLED: t.deliveriesEmptyCancelled };
  const statusText = (s: string, id: string) =>
    s === "CURRENT" ? (live.has(id) ? t.deliveriesLiveTrack : t.deliveriesStatusCurrent) : s === "CANCELLED" ? t.deliveriesStatusCancelled : t.deliveriesStatusDelivered;

  return (
    <>
      <div className="view-bar">
        <div className="chips">
          {TABS.map((tab) => (
            <a key={tab} className="chip" href={href(tab ? `/orders?status=${tab}` : "/orders")} aria-pressed={tab === status}>
              {label[tab]}
            </a>
          ))}
        </div>
        <a className="quiet" href={href("/parcels")}>
          {t.accountParcels}
        </a>
      </div>
      <Loaded load={load} retry={reload}>
        {(data) =>
          data.deliveries.length === 0 ? (
            <Hint>{empty[status as keyof typeof empty]}</Hint>
          ) : (
            <table className="orders">
              <thead>
                <tr>
                  <th scope="col">{t.deliveriesWindowTitle}</th>
                  <th scope="col">{d.status}</th>
                  <th scope="col" className="number">
                    {t.itemsLabel}
                  </th>
                  <th scope="col" className="number">
                    {t.totalLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.deliveries.map((delivery) => (
                  <tr
                    key={delivery.id}
                    className={`status-${delivery.status.toLowerCase()}`}
                    onClick={() => navigate(`/orders/${encodeURIComponent(delivery.id)}`)}
                  >
                    <td>
                      <a href={href(`/orders/${encodeURIComponent(delivery.id)}`)}>
                        {dates.window(delivery.windowStart ?? delivery.creationTime, delivery.windowEnd, d.to)}
                      </a>
                    </td>
                    <td>{statusText(delivery.status, delivery.id)}</td>
                    <td className="number">{delivery.itemCount || ""}</td>
                    <td className="number">{money(delivery.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </Loaded>
    </>
  );
}

export function OrderView({ deliveryId }: { deliveryId: string }) {
  const { t, d } = useT();
  const toast = useToast();
  useTitle(t.deliveriesDetailTitle);
  const [load, reload] = useLoad<DeliveryDetailData>(deliveryId, (signal) => api(`deliveries/${encodeURIComponent(deliveryId)}`, { signal }));
  const delivery = load.status === "ready" ? load.data : null;
  const tracking = useTracking(deliveryId, delivery?.status === "CURRENT");
  const [askCancel, setAskCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rated, setRated] = useState(false);

  const act = async (path: string, success: string, failure: string, body?: unknown) => {
    setBusy(true);
    const result = await api(`deliveries/${encodeURIComponent(deliveryId)}/${path}`, { method: "POST", body });
    setBusy(false);
    toast(result.ok ? success : failure, result.ok ? "info" : "error");
    return result;
  };

  const phase = !delivery
    ? ""
    : delivery.status === "CANCELLED"
      ? t.deliveriesStatusCancelled
      : delivery.status === "COMPLETED"
        ? t.deliveriesStatusDelivered
        : tracking?.scenarioInProgress
          ? t.deliveriesStatusEnRoute
          : t.deliveriesStatusPlanned;

  return (
    <>
      <button type="button" className="quiet back" onClick={() => back("/orders")}>
        {d.backToOrders}
      </button>
      <Loaded load={load} retry={reload}>
        {(data) => {
          const items = data.orders.flatMap((o) => o.items);
          const payment = data.orders.find((o) => o.payment)?.payment ?? null;
          return (
            <div className="order">
              <div>
                <h2>{phase}</h2>
                <p className="hint">
                  {t.deliveriesWindowTitle}: {data.deliveryWindowText}
                </p>
                {tracking?.scenarioInProgress && <TrackingPanel tracking={tracking} />}
                <div className="actions start">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      for (const item of items) if (!item.isUnavailable) cartModel.add(item.productId, item.maxCount, item.quantity);
                      toast(d.orderAgainDone);
                    }}
                  >
                    {d.orderAgain}
                  </button>
                  {(data.status === "COMPLETED" || data.status === "CURRENT") && (
                    <button type="button" className="secondary" disabled={busy} onClick={() => void act("invoice", t.deliveriesInvoiceSuccess, t.deliveriesInvoiceError)}>
                      {t.deliveriesInvoiceButton}
                    </button>
                  )}
                  {data.cancellable && (
                    <button type="button" className="secondary danger" disabled={busy} onClick={() => setAskCancel(true)}>
                      {t.deliveriesCancelButton}
                    </button>
                  )}
                </div>
                {payment && (
                  <p className="hint">
                    {t.deliveriesPaymentTitle}: {[payment.paymentType, payment.redactedIban].filter(Boolean).join(", ")}
                  </p>
                )}
                {data.status === "COMPLETED" && !rated && (
                  <Rating
                    busy={busy}
                    onRate={async (rating) => {
                      const result = await act("rating", t.deliveriesRateSuccess, t.deliveriesRateError, { rating });
                      if (result.ok || result.error === "Delivery already rated") setRated(true);
                    }}
                  />
                )}
              </div>
              <div className="receipt bill">
                <div className="receipt-head">
                  <h2>{t.deliveriesDetailTitle}</h2>
                  <span>{d.items.replace("{n}", String(data.totalCount))}</span>
                </div>
                <Lines cart={{ items, recipeGroups: [] }} editable={false} />
                <div className="sum">
                  <Sums
                    totalPrice={data.totalPrice}
                    depositBreakdown={data.depositBreakdown}
                    membershipSavings={data.membershipSavings}
                    promoSavings={data.promoSavings}
                    fees={data.fees}
                  />
                  {data.returnedContainers.length > 0 && (
                    <>
                      <p>{t.deliveriesReturnedContainers}</p>
                      {data.returnedContainers.map((c) => (
                        <ReturnedRow key={`${c.type}-${c.name}`} name={`${c.name} ×${c.quantity}`} cents={c.price} />
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        }}
      </Loaded>
      {askCancel && (
        <Confirm
          title={t.deliveriesCancelConfirmTitle}
          message={t.deliveriesCancelConfirmMessage}
          busy={busy}
          onCancel={() => setAskCancel(false)}
          onConfirm={async () => {
            const result = await act("cancel", t.deliveriesCancelSuccess, t.deliveriesCancelError);
            setAskCancel(false);
            if (result.ok) reload();
          }}
        />
      )}
    </>
  );
}

function ReturnedRow({ name, cents }: { name: string; cents: number }) {
  const money = useMoney();
  return (
    <div className="sum-row">
      <span>{name}</span>
      <span>{money.plain(cents)}</span>
    </div>
  );
}

function Rating({ busy, onRate }: { busy: boolean; onRate: (rating: number) => Promise<void> }) {
  const { t } = useT();
  const [chosen, setChosen] = useState<number | null>(null);
  return (
    <section className="rating">
      <h3>{t.deliveriesRateTitle}</h3>
      <div className="chips" role="radiogroup" aria-label={t.deliveriesRateTitle}>
        {Array.from({ length: 11 }, (_, value) => (
          <button key={value} type="button" className="chip" role="radio" aria-checked={chosen === value} onClick={() => setChosen(value)}>
            {value}
          </button>
        ))}
        <button type="button" className="primary" disabled={chosen === null || busy} onClick={() => chosen !== null && void onRate(chosen)}>
          {t.deliveriesRateSubmit}
        </button>
      </div>
    </section>
  );
}

/**
 * Live tracking, as picnic-web does it: poll the position, fetch the route
 * ("scenario") again when its version changes, and parse both with
 * picnic-web's parser. Stops when the delivery is no longer on its way.
 */
const TRACKING_RETRY_MS = 15_000;

function useTracking(deliveryId: string, enabled: boolean): DeliveryTrackingData | null {
  const { country } = useT();
  const [tracking, setTracking] = useState<DeliveryTrackingData | null>(null);
  const scenario = useRef<unknown>(null);
  const version = useRef(-1);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const position = await api<Record<string, unknown>>(`deliveries/${encodeURIComponent(deliveryId)}/position`);
      if (stopped) return;
      if (!position.ok) {
        // A failed look (busy, a network hiccup) is tried again; tracking stops only when the delivery is over.
        timer = setTimeout(() => void poll(), TRACKING_RETRY_MS);
        return;
      }
      const positionVersion = typeof position.data.version === "number" ? position.data.version : -1;
      if (scenario.current === null || positionVersion !== version.current) {
        const route = await api<unknown>(`deliveries/${encodeURIComponent(deliveryId)}/scenario`);
        if (stopped) return;
        if (route.ok) {
          scenario.current = route.data;
          version.current = positionVersion;
        }
      }
      const parsed = parseDeliveryTracking(position.data, scenario.current, country);
      setTracking(parsed);
      if (parsed.scenarioInProgress) timer = setTimeout(() => void poll(), Math.max(5000, parsed.queryInterval));
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [deliveryId, enabled, country]);
  return tracking;
}

function TrackingPanel({ tracking }: { tracking: DeliveryTrackingData }) {
  const { t, d } = useT();
  return (
    <section className="tracking">
      <div>
        {tracking.etaText && (
          <p>
            {t.deliveriesTrackingEta}: <strong>{tracking.etaText}</strong>
          </p>
        )}
        {tracking.driverName && (
          <p>
            {t.deliveriesTrackingDriver}: {tracking.driverName}
            {tracking.vehicleName && `, ${tracking.vehicleName}`}
          </p>
        )}
        {tracking.currentPosition && (
          <p>
            <a
              className="quiet"
              href={`https://www.openstreetmap.org/?mlat=${tracking.currentPosition.lat}&mlon=${tracking.currentPosition.lng}#map=16/${tracking.currentPosition.lat}/${tracking.currentPosition.lng}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              {d.openMap}
            </a>
          </p>
        )}
      </div>
      {tracking.route.length > 1 ? <RouteSketch tracking={tracking} /> : <p className="hint">{t.deliveriesTrackingNoMap}</p>}
    </section>
  );
}

/** The van's route as a line, with where it is now and where it goes. No map tiles: nothing leaves the page. */
function RouteSketch({ tracking }: { tracking: DeliveryTrackingData }) {
  const points = tracking.route;
  const target = tracking.destination;
  const lats = [...points.map((p) => p.lat), ...(target ? [target.lat] : [])];
  const lngs = [...points.map((p) => p.lng), ...(target ? [target.lng] : [])];
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const squeeze = Math.cos((minLat * Math.PI) / 180);
  const span = Math.max(maxLat - minLat, (maxLng - minLng) * squeeze, 1e-5);
  const x = (lng: number) => 10 + (((lng - minLng) * squeeze) / span) * 180;
  const y = (lat: number) => 190 - ((lat - minLat) / span) * 180;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.lng).toFixed(1)},${y(p.lat).toFixed(1)}`).join(" ");
  const here = tracking.currentPosition;
  return (
    <svg className="route" viewBox="0 0 200 200" role="img" aria-label="Route">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
      {target && <circle cx={x(target.lng)} cy={y(target.lat)} r="7" className="route-home" />}
      {here && <circle cx={x(here.lng)} cy={y(here.lat)} r="6" className="route-van" />}
    </svg>
  );
}

// ─── Parcels ─────────────────────────────────────────────────────────────────

export function ParcelsView() {
  const { t, d } = useT();
  useTitle(t.accountParcels);
  const [load, reload] = useLoad<ParcelsPageData>("parcels", (signal) => api("parcels", { signal }));
  return (
    <>
      <button type="button" className="quiet back" onClick={() => back("/orders")}>
        {d.backToOrders}
      </button>
      <Loaded load={load} retry={reload}>
        {(page) => (
          <>
            <h2>{page.title || t.accountParcels}</h2>
            {page.subtitle && <Hint>{page.subtitle}</Hint>}
            {page.sections.every((s) => !s.parcels.length) ? (
              <Hint>{t.parcelsEmpty}</Hint>
            ) : (
              page.sections.map((section) => (
                <section key={section.title} className="group">
                  <h3>{section.title}</h3>
                  <table className="orders">
                    <tbody>
                      {section.parcels.map((parcel) => (
                        <tr key={parcel.id} onClick={() => parcel.parcelId && navigate(`/parcels/${encodeURIComponent(parcel.parcelId)}`)}>
                          <td>{parcel.parcelId ? <a href={href(`/parcels/${encodeURIComponent(parcel.parcelId)}`)}>{parcel.name}</a> : parcel.name}</td>
                          <td style={parcel.statusColor ? { color: parcel.statusColor } : undefined}>{parcel.statusText}</td>
                          <td className="number">{parcel.dateText}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))
            )}
          </>
        )}
      </Loaded>
    </>
  );
}

export function ParcelView({ parcelId }: { parcelId: string }) {
  const { t } = useT();
  const toast = useToast();
  const [load, reload] = useLoad<ParcelDetailData>(parcelId, (signal) => api(`parcels/${encodeURIComponent(parcelId)}`, { signal }));
  useTitle(load.status === "ready" ? load.data.title : t.accountParcels);
  return (
    <>
      <button type="button" className="quiet back" onClick={() => back("/parcels")}>
        {t.accountParcels}
      </button>
      <Loaded load={load} retry={reload}>
        {(parcel) => (
          <>
            <h2>{parcel.title}</h2>
            <p>
              {parcel.shipmentLabel} <code>{parcel.shipmentNumber}</code>{" "}
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(parcel.shipmentNumber)
                    .then(() => toast(parcel.copiedMessage ?? "✓"))
                    .catch(() => toast(parcel.shipmentNumber))
                }
              >
                {t.parcelCopyShipmentNumber}
              </button>
            </p>
            <ol className="timeline">
              {parcel.steps.map((step, i) => (
                <li key={i} className={step.done ? "done" : ""}>
                  <span className="dot" style={{ backgroundColor: step.markerColor ?? undefined, width: step.markerSize, height: step.markerSize }} />
                  <span>
                    <strong>{step.title}</strong> <span className="hint-inline">{step.dateText}</span>
                  </span>
                </li>
              ))}
            </ol>
            {parcel.footerText && <Hint>{parcel.footerText}</Hint>}
          </>
        )}
      </Loaded>
    </>
  );
}
