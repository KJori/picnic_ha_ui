/**
 * Rules for every request this app makes to the internet.
 *
 * - A time limit: picnic-api sets none of its own, and no call to Picnic may
 *   hang a request forever.
 * - Only Picnic: the app talks to Picnic's servers and nothing else, so no
 *   part of it (a dependency included) can send anything elsewhere.
 */
const UPSTREAM_TIMEOUT_MS = 25_000;

/**
 * Picnic's servers, over https: the API and pictures (storefront-prod), and
 * the scripts of the app's newer pages (pages-prod), which picnic-api reads
 * to find how the app asks for search results.
 */
const PICNIC_HOST = /^(storefront|pages)-prod\.(nl|de|fr)\.picnicinternational\.com$/;

type Marked = typeof fetch & { deskTimeout?: boolean; deskOnlyPicnic?: boolean };

export function installFetchTimeout(timeoutMs = UPSTREAM_TIMEOUT_MS): void {
  const original = globalThis.fetch as Marked;
  if (original.deskTimeout) return;
  const wrapped = ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    original(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) })) as Marked;
  wrapped.deskTimeout = true;
  wrapped.deskOnlyPicnic = original.deskOnlyPicnic;
  globalThis.fetch = wrapped;
}

/** Refuse, before anything is sent, a request to anywhere but Picnic. */
export function installOnlyPicnic(): void {
  const original = globalThis.fetch as Marked;
  if (original.deskOnlyPicnic) return;
  const wrapped = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== "https:" || !PICNIC_HOST.test(url.hostname) || url.port !== "") {
      throw new TypeError(`Picnic Desk only talks to Picnic, not to ${url.host}`);
    }
    return original(input, init);
  }) as Marked;
  wrapped.deskOnlyPicnic = true;
  wrapped.deskTimeout = original.deskTimeout;
  globalThis.fetch = wrapped;
}
