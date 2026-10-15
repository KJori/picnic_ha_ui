/**
 * The HTTP side of Picnic Desk: serves the page, guards the door, and hands
 * /api/... requests to picnic-web's route handlers (or to the demo shop).
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { DeskRoutes, type Language } from "./desk-routes";
import { type RouteEntry, Router } from "./router";
import { type HaUser, Session, type SetCookie } from "./session";
import { Store } from "./store";
import type { CountryCode } from "@/lib/core/types";

/** Home Assistant's ingress gateway: the only address allowed in under ingress. */
const INGRESS_GATEWAY = "172.30.32.2";
const MAX_BODY_BYTES = 1024 * 1024;
const INTERNAL_BASE = "http://picnic-desk.internal";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".map": "application/json",
  ".woff2": "font/woff2",
};

/**
 * The page loads nothing from outside, pictures included: those come through
 * this server (src/server/pictures.ts). Under ingress the page sits in a frame
 * of Home Assistant's own page, which has the same origin. No inline script
 * or style: React sets styles through the DOM, which this allows.
 */
const PAGE_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

/** Nothing on this page needs the camera, the microphone, the location or the like. */
const PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), midi=(), " +
  "magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), clipboard-read=()";

/** The only request headers picnic-web's routes may see; cookies and Home Assistant's own headers stay out. */
const PASSED_HEADERS = ["content-type", "accept-language"];

/** Answers for someone Home Assistant let in but who may not use this Picnic account. */
const NOT_YOURS = {
  error: "This Picnic account was connected by another Home Assistant user.",
  code: "NOT_YOUR_ACCOUNT",
} as const;

export type DeskOptions = {
  dataDir: string;
  publicDir: string;
  country: CountryCode;
  language: Language;
  ingressOnly: boolean;
  /** The address Home Assistant's ingress gateway connects from; tests set their own. */
  gateway?: string;
  version: string;
  routes: RouteEntry[];
  /**
   * Home Assistant user names (besides the one who signed in to Picnic) who
   * may use the Picnic account here.
   */
  allowedUsers?: string[];
  /** Answers instead of picnic-web's routes; the demo shop. */
  demo?: (request: NextRequest, segments: string[]) => Promise<NextResponse<unknown> | null>;
  /** The size limit of the picture folder; DEFAULT_CACHE_MB when left out. */
  pictureCacheMb?: number;
  now?: () => number;
};

export type InternalResult = { status: number; body: unknown };

export class Desk {
  readonly session: Session;
  readonly store: Store;
  readonly router: Router;
  readonly desk: DeskRoutes;
  /** Set when Picnic refused the saved token; cleared by the next answer that worked. */
  expired = false;

  constructor(readonly options: DeskOptions) {
    this.store = new Store(options.dataDir);
    this.session = new Session(this.store, options.country, options.now);
    this.router = new Router(options.routes);
    this.desk = new DeskRoutes(this);
  }

  /** Node's request handler. Never throws. */
  handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      await this.#handle(req, res);
    } catch (error) {
      console.error("[desk] unexpected:", error instanceof Error ? error.stack : error);
      if (!res.headersSent) send(res, 500, json({ error: "Something went wrong in Picnic Desk." }));
      else res.destroy();
    }
  };

  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this.options.ingressOnly && !fromGateway(req.socket.remoteAddress, this.options.gateway)) {
      send(res, 403, text("Only Home Assistant may open this app."));
      return;
    }

    const url = new URL(req.url ?? "/", INTERNAL_BASE);
    const method = (req.method ?? "GET").toUpperCase();
    let segments: string[];
    try {
      segments = url.pathname.split("/").slice(1).map(decodeURIComponent);
    } catch {
      send(res, 400, text("Bad address."));
      return;
    }
    if (segments.some((s) => s === ".." || s === "." || s.includes("/") || s.includes("\\") || s.includes("\0"))) {
      send(res, 404, text("Not found."));
      return;
    }

    if (segments[0] === "api") {
      await this.#api(req, res, method, url, segments.slice(1), this.haUser(req));
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      send(res, 405, text("Method not allowed."), { allow: "GET, HEAD" });
      return;
    }

    // Picnic's payment page sends the browser back here after paying.
    if (url.pathname === "/checkout/return") {
      send(res, 303, text("See the Picnic Desk tab."), { location: "../#/checkout/return" });
      return;
    }

    const file = url.pathname === "/" ? "index.html" : segments.join("/");
    await this.#static(req, res, file, method === "HEAD");
  }

  async #static(req: IncomingMessage, res: ServerResponse, file: string, headOnly: boolean): Promise<void> {
    const root = normalize(this.options.publicDir + sep);
    const path = normalize(join(root, file));
    if (!path.startsWith(root)) {
      send(res, 404, text("Not found."));
      return;
    }
    let data: Buffer;
    try {
      data = await readFile(path);
    } catch {
      send(res, 404, text("Not found."));
      return;
    }
    // The files change with every app update: the browser always asks, and
    // gets "not modified" while its copy is current.
    const etag = `"${createHash("sha256").update(data).digest("base64url").slice(0, 22)}"`;
    const headers: Record<string, string> = {
      "content-type": TYPES[extname(path)] ?? "application/octet-stream",
      "cache-control": "no-cache",
      etag,
    };
    if (extname(path) === ".html") headers["content-security-policy"] = PAGE_POLICY;
    if (ifNoneMatch(req.headers["if-none-match"], etag)) {
      send(res, 304, { body: "", headers: { etag, "cache-control": "no-cache" } });
      return;
    }
    send(res, 200, {
      body: headOnly ? Buffer.alloc(0) : data,
      headers: headOnly ? { ...headers, "content-length": String(data.length) } : headers,
    });
  }

  async #api(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    url: URL,
    segments: string[],
    user: HaUser | null
  ): Promise<void> {
    // Changes need a header that only this app's page sends. Another site
    // cannot add one without the browser asking this server first, which it
    // never allows, so a page elsewhere cannot fill or empty the basket.
    // Browsers also say where a request comes from; one from another site is
    // refused outright.
    const writing = method !== "GET" && method !== "HEAD";
    const site = req.headers["sec-fetch-site"];
    if (writing && (typeof req.headers["x-desk-base"] !== "string" || (site !== undefined && site !== "same-origin"))) {
      send(res, 403, json({ error: "Changes are only accepted from Picnic Desk's own page." }));
      return;
    }
    if (!this.mayUse(user) && segments.join("/") !== "desk/state") {
      send(res, 403, json(NOT_YOURS));
      return;
    }
    let body: string | null;
    try {
      body = await readBody(req);
    } catch {
      send(res, 413, json({ error: "Request too large." }));
      return;
    }

    const headers: Record<string, string> = {};
    for (const name of PASSED_HEADERS) {
      const value = req.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    const request = new NextRequest(`${INTERNAL_BASE}${url.pathname}${url.search}`, {
      method,
      headers,
      body,
      cookies: this.session.cookies(),
      origin: pageBase(req.headers["x-desk-base"]),
    });

    const response = await this.dispatch(request, segments, user);
    await this.#reply(res, response);
  }

  /**
   * Who Home Assistant says is using the page. Only trusted when only Home
   * Assistant's gateway can connect: anyone else could send these headers.
   */
  haUser(req: IncomingMessage): HaUser | null {
    if (!this.options.ingressOnly) return null;
    const one = (name: string) => {
      const value = req.headers[name];
      return typeof value === "string" ? value.trim() : "";
    };
    const id = one("x-remote-user-id");
    if (!id) return null;
    const name = one("x-remote-user-name");
    return { id, name, displayName: one("x-remote-user-display-name") || name };
  }

  /**
   * The Picnic account belongs to the Home Assistant user who signed in to it
   * here, and to the users named in the app's `allowed_users` option.
   * Signing in is open to everyone; a session from before this rule, or a
   * request Home Assistant did not name a user for, is not restricted.
   */
  mayUse(user: HaUser | null): boolean {
    const owner = this.session.owner;
    if (!this.session.signedIn || !owner || !user) return true;
    if (user.id === owner.id) return true;
    const allowed = (this.options.allowedUsers ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean);
    return user.name !== "" && allowed.includes(user.name.toLowerCase());
  }

  /** Answer one API request; also used inside the app (self-check, bought before). */
  async dispatch(request: NextRequest, segments: string[], user: HaUser | null = null): Promise<Response> {
    if (segments[0] === "desk") return this.desk.handle(request, segments.slice(1), user);

    const isAuthRoute = segments[0] === "auth";
    if (isAuthRoute) request = await prepareAuthRequest(this, request, segments[1]);

    let response: Response | null = null;
    try {
      if (this.options.demo) {
        response = await this.options.demo(request, segments);
      } else {
        const match = this.router.match(request.method, segments);
        if (match.kind === "method") {
          return new Response(JSON.stringify({ error: "Method not allowed." }), {
            status: 405,
            headers: { allow: match.allowed.join(", "), "content-type": "application/json" },
          });
        }
        if (match.kind === "found") {
          response = await match.handler(request, { params: Promise.resolve(match.params) });
        }
      }
    } catch (error) {
      // picnic-web's routes catch their own errors; a few debug routes do not.
      console.error(`[desk] /api/${segments.join("/")} failed:`, error instanceof Error ? error.message : error);
      return NextResponse.json({ error: "Picnic could not be reached. Please try again." }, { status: 502 });
    }
    if (!response) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (isAuthRoute) response = await finishAuthResponse(this, response, segments[1], user);
    else this.#noteTokenState(response);
    return response;
  }

  /** Call an API route from inside the app and read its JSON answer. */
  async internal(path: string, init: { method?: string; body?: unknown } = {}): Promise<InternalResult> {
    const url = new URL(path, `${INTERNAL_BASE}/api/`);
    const request = new NextRequest(url.href, {
      method: init.method ?? "GET",
      body: init.body === undefined ? null : JSON.stringify(init.body),
      headers: init.body === undefined ? {} : { "content-type": "application/json" },
      cookies: this.session.cookies(),
    });
    const segments = url.pathname.split("/").slice(2).map(decodeURIComponent);
    const response = await this.dispatch(request, segments);
    const raw = await response.text();
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // not JSON: keep the text
    }
    return { status: response.status, body: parsed };
  }

  #noteTokenState(response: Response): void {
    if (!this.session.signedIn) return;
    if (response.status === 401) this.expired = true;
    else if (response.ok) this.expired = false;
  }

  async #reply(res: ServerResponse, response: Response): Promise<void> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie") headers[name] = value;
    });
    headers["cache-control"] ??= "no-store";
    const data = Buffer.from(await response.arrayBuffer());
    send(res, response.status, { body: data, headers });
  }
}

// ─── Sign-in plumbing ────────────────────────────────────────────────────────

/**
 * The verification step needs the half-finished token from the step before.
 * picnic-web hands it to the browser and back; here it never leaves the server.
 */
async function prepareAuthRequest(desk: Desk, request: NextRequest, step: string | undefined): Promise<NextRequest> {
  if (step !== "verify-2fa") return request;
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(await request.text());
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    // the route answers an unreadable body itself
  }
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => (headers[name] = value));
  return new NextRequest(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify({ ...body, partialToken: desk.session.partialToken() ?? undefined }),
    cookies: desk.session.cookies(),
    origin: request.nextUrl.origin,
  });
}

async function finishAuthResponse(
  desk: Desk,
  response: Response,
  step: string | undefined,
  user: HaUser | null
): Promise<Response> {
  const before = desk.session.token;
  desk.session.apply(readSetCookies(response));
  if (desk.session.signedIn && response.ok) desk.expired = false;
  // Whoever signed in owns the account here from now on.
  if (desk.session.signedIn && desk.session.token !== before) desk.session.setOwner(user);
  // Signed out, or in as someone else: nothing of the old account may show.
  if (before !== null && desk.session.token !== before) desk.desk.forgetAccountData();
  if (step !== "login-credentials") return stripCookies(response);

  const body = (await response.clone().json().catch(() => null)) as { partialToken?: unknown } | null;
  if (body && typeof body.partialToken === "string") {
    desk.session.holdPartialToken(body.partialToken);
    const { partialToken: _held, ...rest } = body;
    return NextResponse.json(rest, { status: response.status });
  }
  return stripCookies(response);
}

function readSetCookies(response: Response): SetCookie[] {
  return response.headers.getSetCookie().map((line) => {
    const [pair, ...attributes] = line.split(";");
    const at = pair.indexOf("=");
    const name = pair.slice(0, at).trim();
    let value = "";
    try {
      value = decodeURIComponent(pair.slice(at + 1).trim());
    } catch {
      value = pair.slice(at + 1).trim();
    }
    const maxAgeAttribute = attributes.map((a) => a.trim()).find((a) => /^max-age=/i.test(a));
    const maxAge = maxAgeAttribute ? Number(maxAgeAttribute.split("=")[1]) : undefined;
    return { name, value, maxAge };
  });
}

function stripCookies(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  return new Response(response.body, { status: response.status, headers });
}

// ─── Small helpers ───────────────────────────────────────────────────────────

/** If-None-Match holds the tag (or "*"); weak tags count, as for GET they should. */
function ifNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((tag) => {
    const value = tag.trim().replace(/^W\//, "");
    return value === etag || value === "*";
  });
}

export function fromGateway(address: string | undefined, gateway = INGRESS_GATEWAY): boolean {
  return address === gateway || address === `::ffff:${gateway}`;
}

/**
 * Where the page lives as the browser sees it, e.g.
 * https://ha.example/api/hassio_ingress/abc123. The page sends it so the
 * payment page can send the browser back. Anything but a plain http(s)
 * address is ignored.
 */
export function pageBase(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string" || value.length > 500) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (url.username || url.password || url.search || url.hash) return undefined;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  if (req.method === "GET" || req.method === "HEAD") return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("too large");
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : null;
}

type Reply = { body: Buffer | string; headers: Record<string, string> };

const text = (message: string): Reply => ({
  body: message,
  headers: { "content-type": "text/plain; charset=utf-8" },
});

const json = (value: unknown): Reply => ({
  body: JSON.stringify(value),
  headers: { "content-type": "application/json" },
});

function send(res: ServerResponse, status: number, reply: Reply, extra: Record<string, string> = {}): void {
  res.writeHead(status, {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    // Other sites may not embed or read anything from here (pictures and answers included).
    "cross-origin-resource-policy": "same-origin",
    "x-frame-options": "SAMEORIGIN",
    "permissions-policy": PERMISSIONS_POLICY,
    ...reply.headers,
    ...extra,
  });
  res.end(reply.body);
}
