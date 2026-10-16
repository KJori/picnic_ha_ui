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

import type { Badge as BadgeData } from "@/lib/core/types";

import { picnicInk, picnicLabel } from "../lib/colour";
import { dateFormat, moneyFormat } from "../lib/format";
import { useT } from "../state/session";

// ─── Money and dates ─────────────────────────────────────────────────────────

export function useMoney() {
  return moneyFormat(useT().language);
}

export function useDates() {
  const { language, country } = useT();
  return dateFormat(language, country);
}

export function Price({ cents, was, color }: { cents: number; was?: number | null; color?: string | null }) {
  const money = useMoney();
  const ink = picnicInk(color);
  const price = (
    <span className={`price ${ink.className ?? ""}`} style={ink.style}>
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
  const look = picnicLabel(badge.textColor, badge.backgroundColor);
  return (
    <span className={`offer offer-${badge.variant} ${look.className ?? ""}`} style={look.style}>
      {badge.text}
    </span>
  );
}

/** An offer label in Picnic's own colours. */
export function PicnicLabel({ text, fg, bg }: { text: string; fg?: string | null; bg?: string | null }) {
  const look = picnicLabel(fg, bg);
  return (
    <span className={`offer ${look.className ?? ""}`} style={look.style}>
      {text}
    </span>
  );
}

// ─── Pictures ────────────────────────────────────────────────────────────────

/**
 * A Picnic picture inside a `.picture` box, from the app's server, which keeps
 * every picture once it has fetched it from Picnic. Without one, the box shows
 * the name's first letter.
 */
export function Img({
  id,
  kind = "product",
  name = "",
  className = "",
}: {
  id: string | null | undefined;
  kind?: "product" | "recipe";
  name?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const ok = Boolean(id) && failed !== id;
  return (
    <span className={`picture ${className}`} aria-hidden="true">
      {ok ? (
        <img
          src={`api/desk/image?${new URLSearchParams({ id: id!, kind })}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(id ?? null)}
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

/** A button on a notice, such as Undo. */
export type NoticeAction = { label: string; run: () => void };
type Notice = { id: number; text: string; tone: "info" | "error"; action?: NoticeAction };
type Show = (text: string, tone?: "info" | "error", action?: NoticeAction) => void;
const NoticeContext = createContext<Show>(() => {});

export const useToast = () => useContext(NoticeContext);

/** How long a notice stays: longer with a button on it, so there is time to use it. */
const NOTICE_MS = { info: 4500, error: 7000, action: 9000 };

/** One notice at a time at the bottom left, as on the old desk. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const counter = useRef(0);
  const show = useCallback<Show>((text, tone = "info", action) => {
    const id = ++counter.current;
    setNotice({ id, text, tone, action });
    setTimeout(() => setNotice((current) => (current?.id === id ? null : current)), action ? NOTICE_MS.action : NOTICE_MS[tone]);
  }, []);
  return (
    <NoticeContext.Provider value={show}>
      {children}
      <div className={`notice ${notice?.tone === "error" ? "error" : ""}`} role="status" aria-live="polite" hidden={!notice}>
        {notice?.text}
        {notice?.action && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              const { run } = notice.action!;
              setNotice(null);
              run();
            }}
          >
            {notice.action.label}
          </button>
        )}
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
