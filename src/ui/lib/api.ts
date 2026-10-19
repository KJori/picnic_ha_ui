/**
 * Talking to the app's own server. Every address is relative: behind Home
 * Assistant ingress the page lives under /api/hassio_ingress/<token>/.
 */
import type { ApiErrorResponse } from "@/lib/core/types";

export type Result<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; code?: ApiErrorResponse["code"] | string; data?: unknown };

const listeners = new Set<() => void>();

/** Called whenever the server says the Picnic session is gone. */
export function onSignedOut(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Where the page lives as the browser sees it; the payment page returns here. */
export function pageBase(): string {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/\/[^/]*$/, "");
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<Result<T>> {
  let response: Response;
  try {
    response = await fetch(`api/${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        "x-desk-base": pageBase(),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { ok: false, status: 0, error: "network" };
  }

  let data: unknown;
  const text = await response.text().catch(() => "");
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  const body = (typeof data === "object" && data !== null ? data : {}) as Partial<ApiErrorResponse>;
  if (!response.ok || typeof body.error === "string") {
    // Every 401 outside signing in means Picnic no longer accepts the session
    // (some picnic-web routes say so without a code).
    if (response.status === 401 && !path.startsWith("auth/")) listeners.forEach((l) => l());
    return {
      ok: false,
      status: response.status,
      error: typeof body.error === "string" ? body.error : `HTTP ${response.status}`,
      code: body.code,
      data,
    };
  }
  return { ok: true, status: response.status, data: data as T };
}

/** True for an AbortError, which callers ignore. */
export const aborted = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
