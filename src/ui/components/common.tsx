/**
 * Small pieces used on every screen.
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

// ─── Prices ──────────────────────────────────────────────────────────────────

export const LOCALES = { en: "en-IE", nl: "nl-NL", de: "de-DE", fr: "fr-FR" } as const;

export function useMoney(): (cents: number) => string {
  const { language } = useT();
  const format = new Intl.NumberFormat(LOCALES[language], { style: "currency", currency: "EUR" });
  return (cents: number) => format.format(cents / 100);
}

export function Price({
  cents,
  was,
  color,
  className = "",
}: {
  cents: number;
  was?: number | null;
  color?: string | null;
  className?: string;
}) {
  const money = useMoney();
  const discounted = was != null && was > cents;
  return (
    <span className={`price ${discounted ? "price-offer" : ""} ${className}`}>
      <span className="price-now" style={color ? { color } : undefined}>
        {money(cents)}
      </span>
      {discounted && <s className="price-was">{money(was)}</s>}
    </span>
  );
}

export function Badge({ badge }: { badge: BadgeData }) {
  const style =
    badge.backgroundColor || badge.textColor ? { backgroundColor: badge.backgroundColor, color: badge.textColor } : undefined;
  return (
    <span className={`badge badge-${badge.variant}`} style={style}>
      {badge.text}
    </span>
  );
}

// ─── Pictures ────────────────────────────────────────────────────────────────

/**
 * A Picnic picture. Loads from Picnic's image server like picnic-web; when
 * that fails, asks the app's server, which tries the other variants.
 */
export function Img({
  id,
  kind = "product",
  alt = "",
  className = "",
  size,
}: {
  id: string | null | undefined;
  kind?: "product" | "recipe";
  alt?: string;
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
  if (attempt >= sources.length) return <span className={`img img-missing ${className}`} aria-hidden="true" />;
  return (
    <img
      className={`img ${className}`}
      src={sources[attempt]}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setAttempt((n) => n + 1)}
    />
  );
}

// ─── Status ──────────────────────────────────────────────────────────────────

export function Spinner({ label }: { label?: string }) {
  const { t } = useT();
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="visually-hidden">{label ?? t.loadingAriaLabel}</span>
    </div>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t, d } = useT();
  return (
    <div className="error-view" role="alert">
      <p>{message === "network" ? d.networkError : message}</p>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          {t.retryButton}
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

// ─── Quantity ────────────────────────────────────────────────────────────────

export function Stepper({
  quantity,
  maxCount,
  onAdd,
  onRemove,
  name,
  large = false,
}: {
  quantity: number;
  maxCount: number;
  onAdd: () => void;
  onRemove: () => void;
  name: string;
  large?: boolean;
}) {
  const { t } = useT();
  if (quantity === 0) {
    return (
      <button
        type="button"
        className={`add ${large ? "add-large" : ""}`}
        onClick={stop(onAdd)}
        aria-label={`${t.addToCartAriaLabel}: ${name}`}
        disabled={maxCount <= 0}
      >
        {large ? t.addToCartButton : "+"}
      </button>
    );
  }
  return (
    <span className={`stepper ${large ? "stepper-large" : ""}`} onClick={stop(() => {})}>
      <button type="button" onClick={stop(onRemove)} aria-label={`${t.removeOneAriaLabel}: ${name}`}>
        −
      </button>
      <output aria-label={`${t.inCartLabel}: ${name}`}>{quantity}</output>
      <button
        type="button"
        onClick={stop(onAdd)}
        disabled={quantity >= maxCount}
        aria-label={`${t.addOneAriaLabel}: ${name}`}
      >
        +
      </button>
    </span>
  );
}

const stop = (fn: () => void) => (event: { preventDefault(): void; stopPropagation(): void }) => {
  event.preventDefault();
  event.stopPropagation();
  fn();
};

// ─── Dialogs ─────────────────────────────────────────────────────────────────

/** A modal dialog: Esc and the backdrop close it, focus stays inside. */
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
      className={`dialog ${wide ? "dialog-wide" : ""} ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-body">
        <header className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t.closeAriaLabel}>
            ×
          </button>
        </header>
        {children}
      </div>
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
    <Dialog title={title} onClose={onCancel}>
      <p>{message}</p>
      <div className="dialog-actions">
        <button type="button" className="button quiet" onClick={onCancel}>
          {t.cancelButton}
        </button>
        <button type="button" className="button primary" onClick={onConfirm} disabled={busy}>
          {confirmLabel ?? t.confirmButton}
        </button>
      </div>
    </Dialog>
  );
}

// ─── Toasts ──────────────────────────────────────────────────────────────────

type Toast = { id: number; text: string; tone: "info" | "error" };
const ToastContext = createContext<(text: string, tone?: "info" | "error") => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const show = useCallback((text: string, tone: "info" | "error" = "info") => {
    const id = ++counter.current;
    setToasts((list) => [...list.filter((t) => t.text !== text), { id, text, tone }].slice(-3));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === "error" ? 7000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <p key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.text}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
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
