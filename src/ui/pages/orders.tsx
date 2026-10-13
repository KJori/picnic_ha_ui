/**
 * Orders (Picnic calls them deliveries), live tracking, and the parcel service.
 */
import { useEffect, useRef, useState } from "react";

import type {
  DeliveriesApiResponse,
  DeliveryDetailData,
  DeliveryListItem,
  DeliveryRoutePoint,
  DeliveryTrackingData,
  ParcelDetailData,
  ParcelsPageData,
} from "@/lib/core/delivery-types";
import { formatDeliveryDayText, formatTime } from "@/lib/delivery/format-delivery-window";
import { parseDeliveryTracking } from "@/lib/delivery/parse-delivery-tracking";

import { BasketLines, Totals } from "../components/basket";
import { Confirm, Empty, Loaded, Price, useLoad, useMoney, useToast } from "../components/common";
import { useTitle } from "../components/products";
import { api } from "../lib/api";
import { back, href, type Route } from "../lib/router";
import { cartModel } from "../state/cart";
import { useT } from "../state/session";

const TABS = ["", "CURRENT", "COMPLETED", "CANCELLED"] as const;

export function DeliveriesPage({ route }: { route: Route }) {
  const { t, country } = useT();
  useTitle(t.deliveriesTitle);
  const status = (TABS as readonly string[]).includes(route.query.get("status") ?? "") ? (route.query.get("status") ?? "") : "";
  const [load, reload] = useLoad<DeliveriesApiResponse>(status, (signal) =>
    api(`deliveries${status ? `?status=${status}` : ""}`, { signal })
  );
  const [live, setLive] = useState<ReadonlySet<string>>(new Set());

  // Which current orders are on their way, like the app's "Live volgen".
  useEffect(() => {
    if (load.status !== "ready") return;
    const controller = new AbortController();
    const current = load.data.deliveries.filter((d) => d.status === "CURRENT");
    void Promise.all(
      current.map(async (delivery) => {
        const result = await api<{ scenario_in_progress?: boolean }>(
          `deliveries/${encodeURIComponent(delivery.id)}/position`,
          { signal: controller.signal }
        ).catch(() => null);
        return result?.ok && result.data?.scenario_in_progress === true ? delivery.id : null;
      })
    ).then((ids) => {
      if (!controller.signal.aborted) setLive(new Set(ids.filter((id): id is string => id !== null)));
    });
    return () => controller.abort();
  }, [load]);

  const empty = { "": t.deliveriesEmptyAll, CURRENT: t.deliveriesEmptyCurrent, COMPLETED: t.deliveriesEmptyCompleted, CANCELLED: t.deliveriesEmptyCancelled };
  const label = { "": t.deliveriesTabAll, CURRENT: t.deliveriesTabCurrent, COMPLETED: t.deliveriesTabCompleted, CANCELLED: t.deliveriesTabCancelled };
  return (
    <div className="orders">
      <h2>{t.deliveriesTitle}</h2>
      <nav className="tabs" aria-label={t.deliveriesTitle}>
        {TABS.map((tab) => (
          <a key={tab} href={href(tab ? `/deliveries?status=${tab}` : "/deliveries")} aria-current={tab === status ? "page" : undefined}>
            {label[tab]}
          </a>
        ))}
      </nav>
      <Loaded load={load} retry={reload}>
        {(data) =>
          data.deliveries.length === 0 ? (
            <Empty>{empty[status as keyof typeof empty]}</Empty>
          ) : (
            <DeliveryList deliveries={data.deliveries} live={live} country={country} />
          )
        }
      </Loaded>
      <p>
        <a href={href("/parcels")}>{t.accountParcels} ›</a>
      </p>
    </div>
  );
}

function DeliveryList({
  deliveries,
  live,
  country,
}: {
  deliveries: DeliveryListItem[];
  live: ReadonlySet<string>;
  country: "NL" | "DE" | "FR";
}) {
  const { t } = useT();
  const money = useMoney();
  const thisYear = new Date().getFullYear();
  let lastYear = thisYear;
  return (
    <ul className="delivery-list">
      {deliveries.flatMap((delivery) => {
        const year = new Date(delivery.windowStart ?? delivery.creationTime).getFullYear();
        const heading = year !== lastYear ? [<li key={`y${year}`} className="year">{year}</li>] : [];
        lastYear = year;
        const current = delivery.status === "CURRENT";
        return [
          ...heading,
          <li key={delivery.id}>
            <a href={href(`/deliveries/${encodeURIComponent(delivery.id)}`)}>
              <span>
                <strong>{formatDeliveryDayText(delivery.windowStart, country)}</strong>
                {current && delivery.windowStart && delivery.windowEnd && (
                  <span className="muted">
                    {" "}
                    {formatTime(new Date(delivery.windowStart))} – {formatTime(new Date(delivery.windowEnd))}
                  </span>
                )}
                {current && <span className="badge badge-info">{live.has(delivery.id) ? t.deliveriesLiveTrack : t.deliveriesStatusCurrent}</span>}
                {delivery.status === "CANCELLED" && <span className="badge badge-availability">{t.deliveriesStatusCancelled}</span>}
              </span>
              <span>{money(delivery.totalPrice)} ›</span>
            </a>
          </li>,
        ];
      })}
    </ul>
  );
}

export function DeliveryPage({ deliveryId }: { deliveryId: string }) {
  const { t, d } = useT();
  const toast = useToast();
  useTitle(t.deliveriesDetailTitle);
  const [load, reload] = useLoad<DeliveryDetailData>(deliveryId, (signal) =>
    api(`deliveries/${encodeURIComponent(deliveryId)}`, { signal })
  );
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

  const items = delivery?.orders.flatMap((o) => o.items) ?? [];
  const payment = delivery?.orders.find((o) => o.payment)?.payment ?? null;

  return (
    <div className="order">
      <div className="back-bar">
        <button type="button" className="link-like" onClick={() => back("/deliveries")}>
          ‹ {t.deliveriesTitle}
        </button>
        <h2>{t.deliveriesDetailTitle}</h2>
      </div>
      <Loaded load={load} retry={reload}>
        {(data) => (
          <div className="order-body">
            <div>
              <p className="phase">{phase}</p>
              <p className="muted">
                {t.deliveriesWindowTitle}: {data.deliveryWindowText}
              </p>
              {tracking && tracking.scenarioInProgress && <TrackingPanel tracking={tracking} />}
              <BasketLines cart={{ items, recipeGroups: [] }} editable={false} />
              <button
                type="button"
                className="button"
                onClick={() => {
                  for (const item of items) if (!item.isUnavailable) cartModel.add(item.productId, item.maxCount, item.quantity);
                  toast(d.orderAgainDone);
                }}
              >
                {d.orderAgain}
              </button>
            </div>
            <div>
              <Totals
                totalPrice={data.totalPrice}
                totalCount={data.totalCount}
                depositBreakdown={data.depositBreakdown}
                membershipSavings={data.membershipSavings}
                promoSavings={data.promoSavings}
                fees={data.fees}
                minimumOrderValue={null}
              />
              {payment && (
                <section className="panel">
                  <h3>{t.deliveriesPaymentTitle}</h3>
                  {payment.paymentType && (
                    <p>
                      {t.deliveriesPaymentType}: {payment.paymentType}
                    </p>
                  )}
                  {payment.redactedIban && <p>{payment.redactedIban}</p>}
                </section>
              )}
              {data.returnedContainers.length > 0 && (
                <section className="panel">
                  <h3>{t.deliveriesReturnedContainers}</h3>
                  <ul className="plain">
                    {data.returnedContainers.map((c) => (
                      <li key={`${c.type}-${c.name}`}>
                        {c.name} ×{c.quantity} <Price cents={c.price} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <div className="order-actions">
                {data.cancellable && (
                  <button type="button" className="button danger" disabled={busy} onClick={() => setAskCancel(true)}>
                    {t.deliveriesCancelButton}
                  </button>
                )}
                {(data.status === "COMPLETED" || data.status === "CURRENT") && (
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => void act("invoice", t.deliveriesInvoiceSuccess, t.deliveriesInvoiceError)}
                  >
                    {t.deliveriesInvoiceButton}
                  </button>
                )}
              </div>
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
          </div>
        )}
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
    </div>
  );
}

function Rating({ busy, onRate }: { busy: boolean; onRate: (rating: number) => Promise<void> }) {
  const { t } = useT();
  const [chosen, setChosen] = useState<number | null>(null);
  return (
    <section className="panel rating">
      <h3>{t.deliveriesRateTitle}</h3>
      <div role="radiogroup" aria-label={t.deliveriesRateTitle}>
        {Array.from({ length: 11 }, (_, value) => (
          <button key={value} type="button" role="radio" aria-checked={chosen === value} onClick={() => setChosen(value)}>
            {value}
          </button>
        ))}
      </div>
      <button type="button" className="button primary" disabled={chosen === null || busy} onClick={() => chosen !== null && void onRate(chosen)}>
        {t.deliveriesRateSubmit}
      </button>
    </section>
  );
}

/**
 * Live tracking, as picnic-web does it: poll the position, fetch the route
 * ("scenario") again when its version changes, and parse both with
 * picnic-web's parser. Stops when the delivery is no longer on its way.
 */
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
      if (stopped || !position.ok) return;
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
    <section className="panel tracking">
      {tracking.etaText && (
        <p>
          {t.deliveriesTrackingEta}: <strong>{tracking.etaText}</strong>
        </p>
      )}
      {tracking.driverName && (
        <p>
          {t.deliveriesTrackingDriver}: {tracking.driverName}
          {tracking.vehicleName && ` · ${tracking.vehicleName}`}
        </p>
      )}
      {tracking.route.length > 1 ? <RouteSketch tracking={tracking} /> : <p className="muted">{t.deliveriesTrackingNoMap}</p>}
      {tracking.currentPosition && (
        <p>
          <a
            href={`https://www.openstreetmap.org/?mlat=${tracking.currentPosition.lat}&mlon=${tracking.currentPosition.lng}#map=16/${tracking.currentPosition.lat}/${tracking.currentPosition.lng}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {d.openMap} ↗
          </a>
        </p>
      )}
    </section>
  );
}

/** The van's route as a line, with where it is now and where it goes. No map tiles: nothing leaves the page. */
function RouteSketch({ tracking }: { tracking: DeliveryTrackingData }) {
  const points: DeliveryRoutePoint[] = [...tracking.route];
  const target = tracking.destination;
  const lats = [...points.map((p) => p.lat), ...(target ? [target.lat] : [])];
  const lngs = [...points.map((p) => p.lng), ...(target ? [target.lng] : [])];
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const span = Math.max(maxLat - minLat, (maxLng - minLng) * Math.cos((minLat * Math.PI) / 180), 1e-5);
  const x = (lng: number) => 10 + (((lng - minLng) * Math.cos((minLat * Math.PI) / 180)) / span) * 280;
  const y = (lat: number) => 290 - ((lat - minLat) / span) * 280;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.lng).toFixed(1)},${y(p.lat).toFixed(1)}`).join(" ");
  const here = tracking.currentPosition;
  return (
    <svg className="route" viewBox="0 0 300 300" role="img" aria-label="Route">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
      {target && <circle cx={x(target.lng)} cy={y(target.lat)} r="8" className="route-home" />}
      {here && <circle cx={x(here.lng)} cy={y(here.lat)} r="7" className="route-van" />}
    </svg>
  );
}

export function ParcelsPage() {
  const { t } = useT();
  useTitle(t.accountParcels);
  const [load, reload] = useLoad<ParcelsPageData>("parcels", (signal) => api("parcels", { signal }));
  return (
    <div className="parcels">
      <div className="back-bar">
        <button type="button" className="link-like" onClick={() => back("/deliveries")}>
          ‹ {t.deliveriesTitle}
        </button>
        <h2>{load.status === "ready" ? load.data.title || t.accountParcels : t.accountParcels}</h2>
      </div>
      <Loaded load={load} retry={reload}>
        {(page) => (
          <>
            {page.subtitle && <p className="muted">{page.subtitle}</p>}
            {page.sections.every((s) => !s.parcels.length) ? (
              <Empty>{t.parcelsEmpty}</Empty>
            ) : (
              page.sections.map((section) => (
                <section key={section.title}>
                  <h3>{section.title}</h3>
                  <ul className="delivery-list">
                    {section.parcels.map((parcel) => (
                      <li key={parcel.id}>
                        <a
                          href={parcel.parcelId ? href(`/parcels/${encodeURIComponent(parcel.parcelId)}`) : undefined}
                          aria-disabled={!parcel.parcelId}
                        >
                          <span>
                            <strong>{parcel.name}</strong>{" "}
                            <span style={parcel.statusColor ? { color: parcel.statusColor } : undefined}>{parcel.statusText}</span>
                          </span>
                          <span className="muted">{parcel.dateText}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
      </Loaded>
    </div>
  );
}

export function ParcelPage({ parcelId }: { parcelId: string }) {
  const { t } = useT();
  const toast = useToast();
  const [load, reload] = useLoad<ParcelDetailData>(parcelId, (signal) => api(`parcels/${encodeURIComponent(parcelId)}`, { signal }));
  useTitle(load.status === "ready" ? load.data.title : t.accountParcels);
  return (
    <div className="parcel">
      <div className="back-bar">
        <button type="button" className="link-like" onClick={() => back("/parcels")}>
          ‹ {t.accountParcels}
        </button>
      </div>
      <Loaded load={load} retry={reload}>
        {(parcel) => (
          <>
            <h2>{parcel.title}</h2>
            <p>
              {parcel.shipmentLabel} <code>{parcel.shipmentNumber}</code>{" "}
              <button
                type="button"
                className="button small"
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
                  <span
                    className="dot"
                    style={{ backgroundColor: step.markerColor ?? undefined, width: step.markerSize, height: step.markerSize }}
                  />
                  <span>
                    <strong>{step.title}</strong>
                    <small>{step.dateText}</small>
                  </span>
                </li>
              ))}
            </ol>
            {parcel.footerText && <p className="muted">{parcel.footerText}</p>}
          </>
        )}
      </Loaded>
    </div>
  );
}

