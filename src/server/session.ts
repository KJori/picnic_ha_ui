/**
 * The one Picnic session this app holds.
 *
 * picnic-web keeps the Picnic token in a browser cookie. Here it stays on the
 * server, in auth.json: Home Assistant already decides who may open the app,
 * the token never reaches a browser, and every browser in the household shares
 * the one basket. The routes still read it as a cookie: the server adds the
 * cookies to each request before handing it to a route, and takes the ones a
 * route sets back out of its response.
 */
import { AUTH_COOKIE_NAME } from "@/lib/core/auth";
import { COUNTRY_COOKIE_NAME, type CountryCode, SUPPORTED_COUNTRY_CODES } from "@/lib/core/types";

import { isObject, Store } from "./store";

const FILE = "auth.json";
/** A verification code must be entered within this time after it is sent. */
const PARTIAL_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

type Saved = { token: string; country: CountryCode; since: string };

export const isCountry = (value: unknown): value is CountryCode =>
  typeof value === "string" && (SUPPORTED_COUNTRY_CODES as readonly string[]).includes(value);

/** A saved session; 0.x of this app wrote {token} only, which is read as the default country. */
const readSaved = (value: unknown, country: CountryCode): Saved | null => {
  if (!isObject(value) || typeof value.token !== "string" || !value.token) return null;
  return {
    token: value.token,
    country: isCountry(value.country) ? value.country : country,
    since: typeof value.since === "string" ? value.since : "",
  };
};

export type SetCookie = { name: string; value: string; maxAge?: number };

export class Session {
  #saved: Saved | null;
  #partial: { token: string; until: number } | null = null;

  constructor(
    private readonly store: Store,
    readonly defaultCountry: CountryCode,
    private readonly now: () => number = Date.now
  ) {
    this.#saved = readSaved(store.read<unknown>(FILE, null, (_value): _value is unknown => true), defaultCountry);
  }

  get signedIn(): boolean {
    return this.#saved !== null;
  }

  get token(): string | null {
    return this.#saved?.token ?? null;
  }

  get country(): CountryCode {
    return this.#saved?.country ?? this.#pendingCountry ?? this.defaultCountry;
  }

  #pendingCountry: CountryCode | null = null;

  /** The cookies a picnic-web route expects to find on the request. */
  cookies(): Record<string, string> {
    const cookies: Record<string, string> = { [COUNTRY_COOKIE_NAME]: this.country };
    if (this.#saved) cookies[AUTH_COOKIE_NAME] = this.#saved.token;
    return cookies;
  }

  /** Apply the cookies a route set: sign in, sign out or a country change. */
  apply(set: SetCookie[]): void {
    let token: string | null | undefined;
    let country: CountryCode | undefined;
    for (const cookie of set) {
      const removed = cookie.value === "" || cookie.maxAge === 0;
      if (cookie.name === AUTH_COOKIE_NAME) token = removed ? null : cookie.value;
      if (cookie.name === COUNTRY_COOKIE_NAME && !removed && isCountry(cookie.value)) country = cookie.value;
    }
    if (country) this.#pendingCountry = country;
    if (token === null) {
      this.signOut();
    } else if (typeof token === "string") {
      this.#saved = { token, country: country ?? this.country, since: new Date(this.now()).toISOString() };
      this.#partial = null;
      this.store.write(FILE, this.#saved);
    } else if (country && this.#saved && this.#saved.country !== country) {
      this.#saved = { ...this.#saved, country };
      this.store.write(FILE, this.#saved);
    }
  }

  signOut(): void {
    this.#saved = null;
    this.#partial = null;
    this.store.remove(FILE);
  }

  /** The half-finished sign-in token, kept here while Picnic waits for a verification code. */
  holdPartialToken(token: string): void {
    this.#partial = { token, until: this.now() + PARTIAL_TOKEN_LIFETIME_MS };
  }

  partialToken(): string | null {
    if (!this.#partial || this.#partial.until < this.now()) return null;
    return this.#partial.token;
  }

  get since(): string | null {
    return this.#saved?.since ?? null;
  }
}
