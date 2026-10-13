/**
 * Routing in the address's #fragment, so the server and Home Assistant's
 * ingress never see the page's own paths. Routes use picnic-web's paths
 * (/search, /categories/<id>, /pages?pageId=…, /product/<id>, /cookbook, …),
 * which lets Picnic's deep links, resolved by picnic-web's code, open here
 * unchanged.
 */
import { useSyncExternalStore } from "react";

export type Route = { path: string; segments: string[]; query: URLSearchParams; href: string };

function read(): string {
  const hash = window.location.hash.replace(/^#/, "");
  return hash.startsWith("/") ? hash : "/search";
}

let cachedHref = "";
let cached: Route = parse("/search");

export function parse(href: string): Route {
  const [path, search = ""] = href.split("?", 2);
  const clean = path.replace(/\/+$/, "") || "/";
  let segments: string[];
  try {
    segments = clean.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    segments = [];
  }
  return { path: clean, segments, query: new URLSearchParams(search), href };
}

function snapshot(): Route {
  const href = read();
  if (href !== cachedHref) {
    cachedHref = href;
    cached = parse(href);
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot);
}

/** Go to a route, e.g. "/search?q=tofu". `replace` keeps the browser history as it is. */
export function navigate(to: string, replace = false): void {
  const target = `#${to.startsWith("/") ? to : `/${to}`}`;
  if (window.location.hash === target) return;
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

/** The current route with some query values changed; null removes one. */
export function withQuery(route: Route, changes: Record<string, string | null>): string {
  const query = new URLSearchParams(route.query);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) query.delete(key);
    else query.set(key, value);
  }
  const search = query.toString();
  return search ? `${route.path}?${search}` : route.path;
}

/** In-app navigations so far; going back is only safe when there is one. */
let depth = 0;
window.addEventListener("hashchange", () => {
  depth += 1;
});

/** Back in history when the user came from inside the app, otherwise to `fallback`. */
export function back(fallback: string): void {
  if (depth > 0) {
    depth = Math.max(0, depth - 2); // this step back fires a hashchange of its own
    window.history.back();
  } else {
    navigate(fallback);
  }
}

export const href = (to: string) => `#${to}`;
