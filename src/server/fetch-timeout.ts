/** No call to Picnic may hang a request forever; picnic-api sets no timeout of its own. */
const UPSTREAM_TIMEOUT_MS = 25_000;

export function installFetchTimeout(timeoutMs = UPSTREAM_TIMEOUT_MS): void {
  const original = globalThis.fetch;
  if ((original as { deskTimeout?: boolean }).deskTimeout) return;
  const wrapped = (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    original(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) });
  (wrapped as { deskTimeout?: boolean }).deskTimeout = true;
  globalThis.fetch = wrapped as typeof fetch;
}
