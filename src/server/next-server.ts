/**
 * The part of "next/server" that picnic-web's API routes use, so they run
 * unchanged on a plain Node HTTP server.
 *
 * What the vendored routes touch (checked by tests/next-server.test.ts, which
 * scans vendor/ for any other use):
 *
 *   request.json(), request.nextUrl.searchParams, request.nextUrl.origin,
 *   request.cookies.get(name)?.value
 *   NextResponse.json(body, init?), new NextResponse(body, init?),
 *   response.cookies.set(name, value, options)
 *
 * Behaviour follows Next.js: NextResponse is a web Response; json() serialises
 * with JSON.stringify and sets content-type application/json; cookies.set adds
 * a Set-Cookie header.
 */

export type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none" | boolean;
  path?: string;
  maxAge?: number;
  domain?: string;
  expires?: Date;
};

type Cookie = { name: string; value: string };

export class RequestCookies {
  #values = new Map<string, string>();

  constructor(values: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(values)) this.#values.set(name, value);
  }

  get(name: string): Cookie | undefined {
    const value = this.#values.get(name);
    return value === undefined ? undefined : { name, value };
  }

  has(name: string): boolean {
    return this.#values.has(name);
  }

  getAll(): Cookie[] {
    return [...this.#values].map(([name, value]) => ({ name, value }));
  }
}

export class NextURL extends URL {
  #origin: string;

  /**
   * `origin` can be given separately: behind Home Assistant ingress the page
   * lives under a path, and the one route that reads it (checkout) uses it to
   * build the address the payment page returns to.
   */
  constructor(url: string, origin?: string) {
    super(url);
    this.#origin = origin ?? super.origin;
  }

  override get origin(): string {
    return this.#origin;
  }
}

export type NextRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  cookies?: Record<string, string>;
  origin?: string;
};

export class NextRequest {
  readonly method: string;
  readonly url: string;
  readonly nextUrl: NextURL;
  readonly headers: Headers;
  readonly cookies: RequestCookies;
  #body: string | null;

  constructor(url: string, init: NextRequestInit = {}) {
    this.method = (init.method ?? "GET").toUpperCase();
    this.url = url;
    this.nextUrl = new NextURL(url, init.origin);
    this.headers = new Headers(init.headers ?? {});
    this.cookies = new RequestCookies(init.cookies);
    this.#body = init.body ?? null;
  }

  /** Like Request.json(): rejects on an empty or malformed body. */
  async json(): Promise<any> {
    if (this.#body === null || this.#body === "") throw new SyntaxError("Unexpected end of JSON input");
    return JSON.parse(this.#body);
  }

  async text(): Promise<string> {
    return this.#body ?? "";
  }
}

export class ResponseCookies {
  readonly #headers: Headers;
  readonly #set = new Map<string, { value: string; options: CookieOptions }>();

  constructor(headers: Headers) {
    this.#headers = headers;
  }

  set(name: string, value: string, options: CookieOptions = {}): this {
    this.#set.set(name, { value, options });
    this.#headers.append("set-cookie", serializeCookie(name, value, options));
    return this;
  }

  get(name: string): (Cookie & CookieOptions) | undefined {
    const entry = this.#set.get(name);
    return entry ? { name, value: entry.value, ...entry.options } : undefined;
  }

  getAll(): (Cookie & CookieOptions)[] {
    return [...this.#set].map(([name, entry]) => ({ name, value: entry.value, ...entry.options }));
  }
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (typeof options.maxAge === "number") parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    const same = options.sameSite === true ? "strict" : options.sameSite;
    parts.push(`SameSite=${same[0].toUpperCase()}${same.slice(1)}`);
  }
  return parts.join("; ");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class NextResponse<Body = unknown> extends Response {
  readonly cookies: ResponseCookies;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body, init);
    this.cookies = new ResponseCookies(this.headers);
  }

  static override json<JsonBody>(body: JsonBody, init?: ResponseInit): NextResponse<JsonBody> {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new NextResponse<JsonBody>(JSON.stringify(body), { ...init, headers });
  }
}
