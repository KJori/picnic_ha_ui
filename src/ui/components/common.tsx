/**
 * Small pieces used on every screen, in the desk's look: square shelf cells,
 * a filled green stepper, a sheet for dialogs, notices at the bottom left.
 */
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { buildImageUrl, buildRecipeImageUrl } from "@/lib/core/image-url";
import type { Badge as BadgeData } from "@/lib/core/types";

import { useSession, useT } from "../state/session";

// ─── Money and dates ─────────────────────────────────────────────────────────

/** Euro amounts are written the Picnic way for the country ("€ 1,39" in Dutch and English). */
const MONEY_LOCALES = { en: "nl-NL", nl: "nl-NL", de: "de-DE", fr: "fr-FR" } as const;
export const DATE_LOCALES = { en: "en-GB", nl: "nl-NL", de: "de-DE", fr: "fr-FR" } as const;

export function useMoney() {
  const { language } = useT();
  const currency = new Intl.NumberFormat(MONEY_LOCALES[language], { style: "currency", currency: "EUR" });
  const number = new Intl.NumberFormat(MONEY_LOCALES[language], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (cents: number) => currency.format(cents / 100);
  /** Without the euro sign, as on the receipt: "2,78". */
  money.plain = (cents: number) => number.format(cents / 100);
  return money;
}

export function useDates() {
  const { language } = useT();
  const locale = DATE_LOCALES[language];
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const long = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const at = (value: string | number | null | undefined) => (value === null || value === undefined ? null : new Date(value));
  return {
    day: (v: string | number | null | undefined) => (at(v) ? day.format(at(v)!) : ""),
    weekday: (v: string | number | null | undefined) => (at(v) ? weekday.format(at(v)!) : ""),
    clock: (v: string | number | null | undefined) => (at(v) ? clock.format(at(v)!) : ""),
    long: (v: string | number | null | undefined) => (at(v) ? long.format(at(v)!) : ""),
    /** "15 Oct" */
    short: (v: string | number | null | undefined) => (at(v) ? short.format(at(v)!) : ""),
    /** "Thu 15 Oct, 17:00 to 18:00" */
    window: (start: string | null | undefined, end: string | null | undefined, to: string) =>
      start ? `${day.format(new Date(start))}, ${clock.format(new Date(start))}${end ? ` ${to} ${clock.format(new Date(end))}` : ""}` : "",
  };
}

export function Price({ cents, was, color }: { cents: number; was?: number | null; color?: string | null }) {
  const money = useMoney();
  const price = (
    <span className="price" style={color ? { color } : undefined}>
      {money(cents)}
    </span>
  );
  if (was == null || was <= cents) return price;
  return (
    <span className="pricing">
      {price}
      <s>{money(was)}</s>
    </span>
  );
}

export function Badge({ badge }: { badge: BadgeData }) {
  const style =
    badge.backgroundColor || badge.textColor ? { backgroundColor: badge.backgroundColor, color: badge.textColor } : undefined;
  return (
    <span className={`offer offer-${badge.variant}`} style={style}>
      {badge.text}
    </span>
  );
}

// ─── Pictures ────────────────────────────────────────────────────────────────

/**
 * A Picnic picture inside a `.picture` box. Loads from Picnic's image server
 * like picnic-web; when that fails, asks the app's server, which tries the
 * other variants. With nothing left, the box shows the name's first letter.
 */
export function Img({
  id,
  kind = "product",
  name = "",
  className = "",
  size,
}: {
  id: string | null | undefined;
  kind?: "product" | "recipe";
  name?: string;
  className?: string;
  size?: string;
}) {
  const { country, demo } = useSession();
  const sources = id
    ? [
        ...(demo ? [] : [kind === "recipe" ? buildRecipeImageUrl(id, country) : buildImageUrl(id, country, size)]),
        `api/desk/image?${new URLSearchParams({ id, kind })}`,
      ]
    : [];
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [id]);
  return (
    <span className={`picture ${className}`} aria-hidden="true">
      {attempt < sources.length ? (
        <img
          src={sources[attempt]}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setAttempt((n) => n + 1)}
        />
      ) : (
        kind === "product" && name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

// ─── Status ──────────────────────────────────────────────────────────────────

export function Spinner({ label }: { label?: string }) {
  const { t } = useT();
  return (
    <p className="hint loading" role="status">
      <span className="spinner" aria-hidden="true" /> {label ?? t.loadingAriaLabel}
    </p>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t, d } = useT();
  return (
    <div className="trouble" role="alert">
      <p>{message === "network" ? d.networkError : message}</p>
      {onRetry && (
        <button type="button" className="secondary" onClick={onRetry}>
          {t.retryButton}
        </button>
      )}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="hint">{children}</p>;
}

// ─── Quantity ────────────────────────────────────────────────────────────────

/**
 * The desk's stepper: a green "+" while the product is not in the basket,
 * a filled "− 2 +" pill once it is (an outlined one on the receipt).
 */
export function Stepper({
  quantity,
  maxCount,
  onAdd,
  onRemove,
  name,
  want = 1,
}: {
  quantity: number;
  maxCount: number;
  onAdd: () => void;
  onRemove: () => void;
  name: string;
  /** Shown on the "+" when the first click adds more than one (a pasted "2 havermelk"). */
  want?: number;
}) {
  const { d } = useT();
  const stop = (fn: () => void) => (event: { stopPropagation(): void; preventDefault(): void }) => {
    event.stopPropagation();
    event.preventDefault();
    fn();
  };
  return (
    <span className={`stepper ${quantity === 0 ? "empty" : ""}`} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="less" onClick={stop(onRemove)} aria-label={d.oneFewer.replace("{name}", name)} tabIndex={quantity ? 0 : -1}>
        −
      </button>
      <output>{quantity}</output>
      <button
        type="button"
        className="more"
        onClick={stop(onAdd)}
        disabled={quantity >= maxCount}
        aria-label={
          quantity === 0
            ? d.addToBasket.replace("{name}", want > 1 ? `${want} × ${name}` : name)
            : d.oneMore.replace("{name}", name)
        }
      >
        +
      </button>
    </span>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

/** A sheet over the desk: Esc and the backdrop close it, focus stays inside. */
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  className = "",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      previous?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sheet ${wide ? "sheet-wide" : ""} ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <button type="button" className="quiet close" onClick={onClose}>
        {t.closeLabel}
      </button>
      <h2 id={titleId} className="sheet-title">
        {title}
      </h2>
      {children}
    </dialog>
  );
}

export function Confirm({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const { t } = useT();
  return (
    <Dialog title={title} onClose={onCancel} className="sheet-small">
      <p>{message}</p>
      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel}>
          {t.cancelButton}
        </button>
        <button type="button" className="primary" onClick={onConfirm} disabled={busy}>
          {confirmLabel ?? t.confirmButton}
        </button>
      </div>
    </Dialog>
  );
}

// ─── Notices ─────────────────────────────────────────────────────────────────

type Notice = { id: number; text: string; tone: "info" | "error" };
const NoticeContext = createContext<(text: string, tone?: "info" | "error") => void>(() => {});

export const useToast = () => useContext(NoticeContext);

/** One notice at a time at the bottom left, as on the old desk. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const counter = useRef(0);
  const show = useCallback((text: string, tone: "info" | "error" = "info") => {
    const id = ++counter.current;
    setNotice({ id, text, tone });
    setTimeout(() => setNotice((current) => (current?.id === id ? null : current)), tone === "error" ? 7000 : 4500);
  }, []);
  return (
    <NoticeContext.Provider value={show}>
      {children}
      <div className={`notice ${notice?.tone === "error" ? "error" : ""}`} role="status" aria-live="polite" hidden={!notice}>
        {notice?.text}
      </div>
    </NoticeContext.Provider>
  );
}

// ─── Loading data ────────────────────────────────────────────────────────────

export type Load<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string; code?: string };

/**
 * Fetch something when `key` changes; `reload()` fetches it again. A newer
 * request makes an older answer irrelevant.
 */
export function useLoad<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string }>
): [Load<T>, () => void, (data: T) => void] {
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  const [round, setRound] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setState(result.ok ? { status: "ready", data: result.data } : { status: "error", message: result.error, code: result.code });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: error instanceof Error ? error.message : "network" });
      });
    return () => controller.abort();
  }, [key, round]);
  const reload = useCallback(() => setRound((n) => n + 1), []);
  const replace = useCallback((data: T) => setState({ status: "ready", data }), []);
  return [state, reload, replace];
}

export function Loaded<T>({
  load,
  retry,
  children,
}: {
  load: Load<T>;
  retry?: () => void;
  children: (data: T) => ReactNode;
}) {
  if (load.status === "loading") return <Spinner />;
  if (load.status === "error") return <ErrorView message={load.message} onRetry={retry} />;
  return <>{children(load.data)}</>;
}

/** Keeps the browser tab's title in step with the screen. */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Picnic` : "Picnic";
  }, [title]);
}
