/**
 * Test helpers: a stand-in for Picnic's servers at the fetch level, and a
 * running Picnic Desk around picnic-web's real routes.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Desk, type DeskOptions } from "../src/server/app";
import { VENDORED_ROUTES } from "../src/server/routes.generated";

export const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/picnic/${name}`, import.meta.url), "utf8"));

export type Seen = { method: string; url: URL; headers: Headers; body: string | null };
type Answer = Response | ((seen: Seen) => Response | Promise<Response>);

export const json = (value: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

/**
 * Answers requests to Picnic (storefront-prod.<cc>.picnicinternational.com)
 * from registered routes; anything else is a test failure, so nothing leaves
 * the machine. Every request is kept in `seen`.
 */
export class FakePicnic {
  readonly seen: Seen[] = [];
  readonly #routes: { method: string; pattern: RegExp; answer: Answer }[] = [];
  readonly #original = globalThis.fetch;

  on(method: string, pattern: RegExp | string, answer: Answer): this {
    const regex = typeof pattern === "string" ? new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) : pattern;
    this.#routes.unshift({ method, pattern: regex, answer });
    return this;
  }

  install(): this {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (!/^storefront-prod\.(nl|de|fr)\.picnicinternational\.com$/.test(url.hostname)) {
        throw new Error(`test tried to reach ${url.href}`);
      }
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? init.body : null;
      const seen: Seen = { method, url, headers: new Headers(init?.headers), body };
      this.seen.push(seen);
      // Path relative to the API base, e.g. "/cart" or "/pages/search-page-results?search_term=x".
      const path = url.pathname.replace(/^\/api\/\d+/, "") + url.search;
      const route = this.#routes.find((r) => r.method === method && r.pattern.test(path));
      if (!route) return json({ error: { message: `no fake for ${method} ${path}` } }, { status: 599, statusText: "Unfaked" });
      const answer = Promise.resolve(typeof route.answer === "function" ? route.answer(seen) : route.answer.clone());
      return abortable(answer, init?.signal ?? undefined);
    }) as typeof fetch;
    return this;
  }

  restore(): void {
    globalThis.fetch = this.#original;
  }

  last(pathPart: string): Seen | undefined {
    return [...this.seen].reverse().find((s) => (s.url.pathname + s.url.search).includes(pathPart));
  }
}

export type Running = {
  base: string;
  desk: Desk;
  dataDir: string;
  close: () => Promise<void>;
  get: (path: string, headers?: Record<string, string>) => Promise<{ status: number; body: any; headers: Headers }>;
  post: (path: string, body?: unknown, method?: string) => Promise<{ status: number; body: any; headers: Headers }>;
};

/** Picnic Desk on a free port, with picnic-web's routes and a fresh data folder. */
export async function runDesk(options: Partial<DeskOptions> = {}): Promise<Running> {
  const dataDir = mkdtempSync(join(tmpdir(), "desk-test-"));
  const desk = new Desk({
    dataDir,
    publicDir: new URL("../src/ui", import.meta.url).pathname,
    country: "NL",
    language: "en",
    ingressOnly: false,
    version: "test",
    routes: VENDORED_ROUTES,
    watchPayments: false,
    ...options,
  });
  const server: Server = createServer(desk.handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // The test's own requests must reach the server even while Picnic is faked.
  const realFetch = FAKE_SAFE_FETCH;
  const read = async (response: Response) => {
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep the text
    }
    return { status: response.status, body, headers: response.headers };
  };
  return {
    base,
    desk,
    dataDir,
    get: async (path, headers = {}) => read(await realFetch(`${base}${path}`, { headers })),
    post: async (path, body, method = "POST") =>
      read(
        await realFetch(`${base}${path}`, {
          method,
          headers: {
            "x-desk-base": base,
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
        })
      ),
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections(); // keep-alive connections would hold close() open
      });
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/**
 * Like real fetch: an aborted signal (the app's time limit) ends the wait for
 * an answer, and ends reading a body that is still coming.
 */
async function abortable(answer: Promise<Response>, signal: AbortSignal | undefined): Promise<Response> {
  if (!signal) return answer;
  signal.throwIfAborted();
  const aborted = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  const response = await Promise.race([answer, aborted]);
  if (!response.body) return response;
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/** fetch as it was before any fake was installed. */
export const FAKE_SAFE_FETCH: typeof fetch = globalThis.fetch.bind(globalThis);

/** Sign the running desk in with a token, the way the login page's token form does. */
export async function signIn(running: Running, picnic: FakePicnic, token = "token-1") {
  picnic.on("GET", /^\/suggest/, json([]));
  const result = await running.post("/api/auth/login", { token, countryCode: "NL" });
  if (result.status !== 200 || result.body?.success !== true) throw new Error(`sign-in failed: ${JSON.stringify(result.body)}`);
}
