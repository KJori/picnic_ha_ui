/**
 * Picnic Desk's own API, under /api/desk/. Everything else under /api/ is
 * picnic-web's.
 *
 *   GET  state            signed in?, country, demo, version
 *   POST code             send the verification code again {channel: "SMS"|"EMAIL"}
 *   GET  image            ?id=&kind=product|recipe  a picture, kept on disk after the first time
 *   GET  saved            starred products;  POST saved {product} toggles one
 *   GET  shortcuts        the search shortcuts;  PUT shortcuts {shortcuts}
 *   GET  history          "bought before", from the last deliveries  (?refresh=1)
 *   GET  selfcheck        tries each part against Picnic, read-only
 *   GET  raw              ?page=<page id>  what Picnic sends for a page, as a download
 *   GET  recipe-price     ?id=<recipe id>  price of a recipe's main ingredients, kept a day
 *   GET  lists            the saved lists;  PUT lists {lists} replaces them all
 *   GET  picks            the product chosen per pasted line;  PUT picks {term, product|null}
 *   DELETE payment        forget a payment the app stopped watching (the open payment is in state)
 */
import { NextRequest, NextResponse } from "next/server";

import { isApiAuthError } from "@/lib/core/api-error";
import { mapWithConcurrency } from "@/lib/core/concurrency";
import type { DeliveriesApiResponse, DeliveryDetailData } from "@/lib/core/delivery-types";
import { buildPicnicClient } from "@/lib/core/picnic-client";
import { mapRecipeDetails } from "@/lib/recipe/map-recipe-details";
import type { DeliverySlotPickerData } from "@/lib/core/delivery-slot-types";
import type {
  CartData,
  CartItem,
  CookbookApiResponse,
  CountryCode,
  Product,
  ProductDetail,
  RecipeDetail,
  SearchApiResponse,
} from "@/lib/core/types";
import type { ProfileData } from "@/lib/core/user-types";
import type { RscPageModel } from "@/lib/rsc/rsc-page-types";

import { recipePrice } from "../shared/recipe-price";
import type { Desk } from "./app";
import type { HaUser } from "./session";
import { L1_CATEGORIES, productById } from "./demo/data";
import { join } from "node:path";

import type { OpenPayment } from "./payments";
import { DEFAULT_CACHE_MB, Pictures } from "./pictures";
import { isObject } from "./store";

export type DeskState = {
  /** Home Assistant let this person in, but the Picnic account here is someone else's. */
  notYours: boolean;
  signedIn: boolean;
  expired: boolean;
  awaitingCode: boolean;
  country: CountryCode;
  language: Language;
  demo: boolean;
  version: string;
  /** A payment started here and not finished yet: the app confirms it when Picnic says it is paid. */
  payment: OpenPayment | null;
};

export const LANGUAGES = ["en", "nl", "de", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];

/** What is kept of a starred product: enough to show it and add it. */
export type SavedProduct = Pick<Product, "id" | "name" | "imageId" | "unitQuantity" | "displayPrice">;
export type Shortcut = { label: string; query: string };
/** A product on a list, with how many and how many Picnic allows. */
export type ListItem = { product: SavedProduct; count: number; maxCount: number };
/** A basket kept for another time ("weekly basics"). */
export type ShoppingList = { id: string; name: string; items: ListItem[]; updatedAt: string };
/** The product chosen for a line of a pasted list, by the line's words ("havermelk"). */
export type Picks = Record<string, SavedProduct>;
export type HistoryItem = { item: CartItem; times: number; lastBought: string };
export type HistoryData = { builtAt: string; deliveries: number; items: HistoryItem[] };
/** One step of the self-check. `key` names it for the page; `name` and `detail` are English, for bug reports. */
export type Check = { key: CheckKey; name: string; ok: boolean; ms: number; detail: string };
export type CheckKey =
  | "account"
  | "access"
  | "search"
  | "product"
  | "pictures"
  | "basket"
  | "slots"
  | "categories"
  | "recipes"
  | "deliveries";
export type RecipePrice = { id: string; total: number; perServing: number; portions: number; at: string };

const SAVED_MAX = 500;
const LISTS_MAX = 30;
const LIST_ITEMS_MAX = 200;
const LIST_ID = /^[a-z0-9-]{1,40}$/;
const PICKS_MAX = 500;
const SHORTCUTS_MAX = 24;
const HISTORY_DELIVERIES = 10;
const HISTORY_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const RECIPE_ID = /^[0-9a-f]{24}$/;
const RECIPE_PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECIPE_PRICES_MAX = 2000;
/** Recipe prices are worked out a few at a time, so cards on screen do not set off Picnic's rate limit. */
const RECIPE_PRICE_PARALLEL = 2;
/** A word every Picnic country's shop has products for. */
const SELF_CHECK_WORD: Record<CountryCode, string> = { NL: "melk", DE: "milch", FR: "lait" };
const PAGE_ID = /^[A-Za-z0-9_.-]{1,80}(\?[A-Za-z0-9_=&.%-]{0,200})?$/;

const DEFAULT_SHORTCUTS: Record<CountryCode, Shortcut[]> = {
  NL: [
    { label: "Brood", query: "brood" },
    { label: "Vegan", query: "vegan" },
    { label: "Groente", query: "groente" },
    { label: "Fruit", query: "fruit" },
    { label: "Zuivel", query: "zuivel" },
    { label: "Koffie", query: "koffie" },
  ],
  DE: [
    { label: "Brot", query: "brot" },
    { label: "Vegan", query: "vegan" },
    { label: "Gemüse", query: "gemüse" },
    { label: "Obst", query: "obst" },
    { label: "Milchprodukte", query: "milch" },
    { label: "Kaffee", query: "kaffee" },
  ],
  FR: [
    { label: "Pain", query: "pain" },
    { label: "Vegan", query: "vegan" },
    { label: "Légumes", query: "légumes" },
    { label: "Fruits", query: "fruits" },
    { label: "Produits laitiers", query: "lait" },
    { label: "Café", query: "café" },
  ],
};

const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

const isSavedProduct = (value: unknown): value is SavedProduct =>
  isObject(value) &&
  text(value.id, 100) &&
  text(value.name, 300) &&
  typeof value.imageId === "string" &&
  value.imageId.length <= 200 &&
  typeof value.unitQuantity === "string" &&
  value.unitQuantity.length <= 100 &&
  typeof value.displayPrice === "number" &&
  Number.isFinite(value.displayPrice);

/** 0.x of this app kept {id, name, unit, image, price, max}; read those as today's shape. */
function fromOldSaved(value: unknown): unknown {
  if (!isObject(value) || "displayPrice" in value || typeof value.id !== "string") return value;
  return {
    id: value.id,
    name: value.name,
    imageId: typeof value.image === "string" ? value.image : "",
    unitQuantity: typeof value.unit === "string" ? value.unit : "",
    displayPrice: typeof value.price === "number" ? value.price : 0,
  };
}

/** What is kept of a product sent by the page: the known fields only. */
function savedSnapshot(product: Record<string, unknown>): SavedProduct | null {
  const snapshot = {
    id: product.id,
    name: product.name,
    imageId: product.imageId ?? "",
    unitQuantity: product.unitQuantity ?? "",
    displayPrice: product.displayPrice,
  };
  return isSavedProduct(snapshot) ? snapshot : null;
}

const isListItem = (value: unknown): value is ListItem =>
  isObject(value) &&
  isObject(value.product) &&
  savedSnapshot(value.product) !== null &&
  Number.isInteger(value.count) &&
  (value.count as number) >= 1 &&
  (value.count as number) <= 99 &&
  Number.isInteger(value.maxCount) &&
  (value.maxCount as number) >= 1 &&
  (value.maxCount as number) <= 999;

const snapshotItem = (item: ListItem): ListItem => ({
  product: savedSnapshot(item.product as unknown as Record<string, unknown>)!,
  count: Math.min(item.count, item.maxCount),
  maxCount: item.maxCount,
});

const isShoppingList = (value: unknown): value is ShoppingList =>
  isObject(value) &&
  typeof value.id === "string" &&
  LIST_ID.test(value.id) &&
  text(value.name, 60) &&
  typeof value.updatedAt === "string" &&
  value.updatedAt.length <= 40 &&
  Array.isArray(value.items) &&
  value.items.length <= LIST_ITEMS_MAX &&
  value.items.every(isListItem);

/** "  2x Havermelk " and "havermelk" are the same line: lower case, single spaces. */
export function pickTerm(words: string): string {
  return words.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
}

const isShortcut = (value: unknown): value is Shortcut =>
  isObject(value) && text(value.label, 40) && text(value.query, 100);

const isHistory = (value: unknown): value is HistoryData =>
  isObject(value) && typeof value.builtAt === "string" && Array.isArray(value.items);

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });
const signedOut = () =>
  NextResponse.json({ error: "Sign in to Picnic first.", code: "TOKEN_EXPIRED" as const }, { status: 401 });

export class DeskRoutes {
  readonly pictures: Pictures;
  #historyBuild: Promise<HistoryData> | null = null;
  /**
   * Goes up when the account changes. Work started for the old account
   * (bought before, recipe prices) checks it before keeping its result, so
   * nothing of one account is written after signing out of it.
   */
  #account = 0;

  constructor(private readonly desk: Desk) {
    this.pictures = new Pictures({
      // The demo shop draws its own pictures and keeps none.
      dir: desk.options.demo ? undefined : join(desk.options.dataDir, "picture-cache"),
      maxBytes: (desk.options.pictureCacheMb ?? DEFAULT_CACHE_MB) * 1024 * 1024,
      now: desk.options.now,
    });
  }

  async handle(request: NextRequest, segments: string[], user: HaUser | null = null): Promise<Response> {
    const route = `${request.method} ${segments.join("/")}`;
    switch (route) {
      case "GET state":
        return NextResponse.json(this.state(user));
      case "POST code":
        return this.#resendCode(request);
      case "GET image":
        return this.#image(request);
      case "GET saved":
        return NextResponse.json({ products: this.saved() });
      case "POST saved":
        return this.#toggleSaved(request);
      case "GET shortcuts":
        return NextResponse.json({ shortcuts: this.shortcuts() });
      case "PUT shortcuts":
        return this.#setShortcuts(request);
      case "GET history":
        return this.#history(request);
      case "GET selfcheck":
        return this.#selfcheck();
      case "GET raw":
        return this.#raw(request);
      case "GET recipe-price":
        return this.#recipePrice(request);
      case "GET lists":
        return NextResponse.json({ lists: this.lists() });
      case "PUT lists":
        return this.#setLists(request);
      case "GET picks":
        return NextResponse.json({ picks: this.picks() });
      case "PUT picks":
        return this.#setPick(request);
      case "DELETE payment":
        // Only one the app gave up on: an open payment is still being watched.
        if (this.desk.payments.open?.gaveUp) this.desk.payments.forget();
        return NextResponse.json({ payment: this.desk.payments.open });
    }
    const known = ["state", "code", "image", "saved", "shortcuts", "history", "selfcheck", "raw", "recipe-price", "lists", "picks", "payment"];
    return known.includes(segments.join("/")) ? error("Method not allowed.", 405) : error("Not found.", 404);
  }

  state(user: HaUser | null = null): DeskState {
    const { session } = this.desk;
    if (!this.desk.mayUse(user)) {
      // Nothing about the account for someone it does not belong to.
      return {
        notYours: true,
        signedIn: false,
        expired: false,
        awaitingCode: false,
        country: session.country,
        language: this.desk.options.language,
        demo: Boolean(this.desk.options.demo),
        version: this.desk.options.version,
        payment: null,
      };
    }
    return {
      notYours: false,
      signedIn: session.signedIn && !this.desk.expired,
      expired: session.signedIn && this.desk.expired,
      awaitingCode: session.partialToken() !== null,
      country: session.country,
      language: this.desk.options.language,
      demo: Boolean(this.desk.options.demo),
      version: this.desk.options.version,
      payment: session.signedIn ? this.desk.payments.open : null,
    };
  }

  // ─── Sign-in ──────────────────────────────────────────────────────────────

  async #resendCode(request: NextRequest): Promise<Response> {
    const body = await request.json().catch(() => null);
    const channel = isObject(body) ? body.channel : undefined;
    if (channel !== "SMS" && channel !== "EMAIL") return error("channel must be SMS or EMAIL", 400);
    const partial = this.desk.session.partialToken();
    if (!partial) return error("Start signing in again: the verification step has expired.", 409);
    if (this.desk.options.demo) return NextResponse.json({ sent: channel });
    try {
      await buildPicnicClient(partial, this.desk.session.country).auth.generate2FACode(channel);
      return NextResponse.json({ sent: channel });
    } catch (err) {
      console.error("[/api/desk/code] Failed:", err instanceof Error ? err.message : err);
      return error("Picnic did not send a code. Please try again in a minute.", 502);
    }
  }

  // ─── Pictures ─────────────────────────────────────────────────────────────

  async #image(request: NextRequest): Promise<Response> {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    const kind = request.nextUrl.searchParams.get("kind") === "recipe" ? "recipe" : "product";
    const { picture } = this.desk.options.demo
      ? { picture: demoPicture(id) }
      : await this.pictures.load(id, kind, this.desk.session.country);
    if (!picture) return new NextResponse(null, { status: 404, headers: { "cache-control": "no-store" } });
    return new NextResponse(new Uint8Array(picture.data), {
      headers: {
        "content-type": picture.type,
        // The browser may keep it too; a picture's id stays with that picture.
        "cache-control": "private, max-age=2592000",
        "content-security-policy": "default-src 'none'",
      },
    });
  }

  // ─── Starred products ─────────────────────────────────────────────────────

  saved(): SavedProduct[] {
    const list = this.desk.store.read<unknown[]>("saved.json", [], (v): v is unknown[] => Array.isArray(v));
    return list.map(fromOldSaved).filter(isSavedProduct);
  }

  async #toggleSaved(request: NextRequest): Promise<Response> {
    const body = await request.json().catch(() => null);
    const product = isObject(body) ? body.product : undefined;
    if (!isObject(product)) return error("product is required", 400);
    const snapshot = savedSnapshot(product);
    if (!snapshot) return error("product needs id, name and displayPrice", 400);
    const saved = this.saved();
    const at = saved.findIndex((p) => p.id === snapshot.id);
    if (at >= 0) saved.splice(at, 1);
    else saved.unshift(snapshot);
    this.desk.store.write("saved.json", saved.slice(0, SAVED_MAX));
    return NextResponse.json({ products: saved.slice(0, SAVED_MAX), saved: at < 0 });
  }

  // ─── Lists ────────────────────────────────────────────────────────────────

  lists(): ShoppingList[] {
    const raw = this.desk.store.read<unknown[]>("lists.json", [], (v): v is unknown[] => Array.isArray(v));
    return raw.filter(isShoppingList);
  }

  /** The page edits lists and sends them all back: few lists, small, from one household. */
  async #setLists(request: NextRequest): Promise<Response> {
    const body = await request.json().catch(() => null);
    const lists = isObject(body) ? body.lists : undefined;
    if (!Array.isArray(lists) || lists.length > LISTS_MAX || !lists.every(isShoppingList)) {
      return error(`lists must be at most ${LISTS_MAX} lists of at most ${LIST_ITEMS_MAX} products, each with a name`, 400);
    }
    if (new Set(lists.map((l) => l.id)).size !== lists.length) return error("each list needs its own id", 400);
    const clean: ShoppingList[] = lists.map((list) => ({
      id: list.id,
      name: list.name.trim(),
      updatedAt: list.updatedAt,
      // One line per product: a product twice on a list is counted together.
      items: [...list.items.reduce((byId, item) => {
        const known = byId.get(item.product.id);
        byId.set(item.product.id, known ? { ...known, count: Math.min(known.maxCount, known.count + item.count) } : snapshotItem(item));
        return byId;
      }, new Map<string, ListItem>()).values()],
    }));
    this.desk.store.write("lists.json", clean);
    return NextResponse.json({ lists: clean });
  }

  // ─── Picks for a pasted list ──────────────────────────────────────────────

  picks(): Picks {
    const raw = this.desk.store.read<Record<string, unknown>>("picks.json", {}, isObject);
    return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, SavedProduct] => isSavedProduct(entry[1])));
  }

  async #setPick(request: NextRequest): Promise<Response> {
    const body = await request.json().catch(() => null);
    const term = isObject(body) && typeof body.term === "string" ? pickTerm(body.term) : "";
    if (!term) return error("term is required: the words of a line", 400);
    const picks = this.picks();
    delete picks[term]; // set or forget; set puts it last, so the oldest go first when full
    if (isObject(body) && body.product !== null) {
      const product = isObject(body.product) ? savedSnapshot(body.product) : null;
      if (!product) return error("product needs id, name and displayPrice", 400);
      picks[term] = product;
    }
    const kept = Object.entries(picks).slice(-PICKS_MAX);
    this.desk.store.write("picks.json", Object.fromEntries(kept));
    return NextResponse.json({ picks: Object.fromEntries(kept) });
  }

  // ─── Shortcuts ────────────────────────────────────────────────────────────

  shortcuts(): Shortcut[] {
    const own = this.desk.store.read<Shortcut[] | null>("shortcuts.json", null, (v): v is Shortcut[] | null =>
      Array.isArray(v)
    );
    return own ? own.filter(isShortcut) : DEFAULT_SHORTCUTS[this.desk.session.country];
  }

  async #setShortcuts(request: NextRequest): Promise<Response> {
    const body = await request.json().catch(() => null);
    const list = isObject(body) ? body.shortcuts : undefined;
    if (list === null) {
      this.desk.store.remove("shortcuts.json");
      return NextResponse.json({ shortcuts: this.shortcuts() });
    }
    if (!Array.isArray(list) || list.length > SHORTCUTS_MAX || !list.every(isShortcut)) {
      return error(`shortcuts must be a list of at most ${SHORTCUTS_MAX} {label, query}`, 400);
    }
    const clean = list.map((s) => ({ label: s.label.trim(), query: s.query.trim() }));
    this.desk.store.write("shortcuts.json", clean);
    return NextResponse.json({ shortcuts: clean });
  }

  // ─── Bought before ────────────────────────────────────────────────────────

  async #history(request: NextRequest): Promise<Response> {
    if (!this.desk.session.signedIn && !this.desk.options.demo) return signedOut();
    const cached = this.desk.store.read<HistoryData | null>("history.json", null, (v): v is HistoryData | null =>
      isHistory(v)
    );
    const now = (this.desk.options.now ?? Date.now)();
    const fresh = cached && now - Date.parse(cached.builtAt) < HISTORY_MAX_AGE_MS;
    if (fresh && request.nextUrl.searchParams.get("refresh") !== "1") return NextResponse.json(cached);
    try {
      const build = (this.#historyBuild ??= this.#buildHistory().finally(() => {
        if (this.#historyBuild === build) this.#historyBuild = null;
      }));
      return NextResponse.json(await build);
    } catch (err) {
      if (err instanceof HistoryError) {
        if (cached) return NextResponse.json(cached); // old list beats none
        return NextResponse.json(err.body, { status: err.status });
      }
      throw err;
    }
  }

  async #buildHistory(): Promise<HistoryData> {
    const account = this.#account;
    const list = await this.desk.internal("deliveries?status=COMPLETED");
    if (list.status !== 200) throw new HistoryError(list.status, list.body);
    const deliveries = ((list.body as DeliveriesApiResponse).deliveries ?? []).slice(0, HISTORY_DELIVERIES);
    const details = await mapWithConcurrency(
      deliveries,
      (d) => this.desk.internal(`deliveries/${encodeURIComponent(d.id)}`),
      3
    );
    const byProduct = new Map<string, HistoryItem>();
    details.forEach((result, index) => {
      if (result.status !== 200) return;
      const detail = result.body as DeliveryDetailData;
      const when = deliveries[index].windowStart ?? deliveries[index].creationTime;
      for (const order of detail.orders ?? []) {
        for (const item of order.items ?? []) {
          const known = byProduct.get(item.productId);
          if (known) {
            known.times += 1;
            if (Date.parse(when) > Date.parse(known.lastBought)) known.lastBought = when;
          } else {
            byProduct.set(item.productId, { item, times: 1, lastBought: when });
          }
        }
      }
    });
    const items = [...byProduct.values()].sort(
      (a, b) =>
        b.times - a.times ||
        (Date.parse(b.lastBought) || 0) - (Date.parse(a.lastBought) || 0) ||
        a.item.name.localeCompare(b.item.name)
    );
    const data: HistoryData = {
      builtAt: new Date((this.desk.options.now ?? Date.now)()).toISOString(),
      deliveries: deliveries.length,
      items,
    };
    if (account !== this.#account) throw new HistoryError(401, { error: "Signed out meanwhile.", code: "TOKEN_EXPIRED" });
    this.desk.store.write("history.json", data);
    return data;
  }

  // ─── Recipe prices ────────────────────────────────────────────────────────

  #recipePrices: Record<string, RecipePrice> | null = null;
  #priceSlots = RECIPE_PRICE_PARALLEL;
  #priceWaiting: (() => void)[] = [];
  #priceRuns = new Map<string, Promise<Response>>();

  async #recipePrice(request: NextRequest): Promise<Response> {
    if (!this.desk.session.signedIn && !this.desk.options.demo) return signedOut();
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!RECIPE_ID.test(id)) return error("id must be a recipe id", 400);
    this.#recipePrices ??= this.desk.store.read<Record<string, RecipePrice>>(
      "recipe_prices.json",
      {},
      (v): v is Record<string, RecipePrice> => isObject(v)
    );
    const now = (this.desk.options.now ?? Date.now)();
    const known = this.#recipePrices[id];
    if (known && now - Date.parse(known.at) < RECIPE_PRICE_MAX_AGE_MS) return NextResponse.json(known);
    let run = this.#priceRuns.get(id);
    if (!run) {
      const started: Promise<Response> = this.#workOutPrice(id).finally(() => {
        if (this.#priceRuns.get(id) === started) this.#priceRuns.delete(id);
      });
      this.#priceRuns.set(id, started);
      run = started;
    }
    return (await run).clone();
  }

  async #workOutPrice(id: string): Promise<Response> {
    const account = this.#account;
    if (this.#priceSlots === 0) await new Promise<void>((resolve) => this.#priceWaiting.push(resolve));
    else this.#priceSlots -= 1;
    try {
      let recipe: RecipeDetail;
      if (this.desk.options.demo) {
        const result = await this.desk.internal(`recipe/${id}`);
        if (result.status !== 200) return NextResponse.json({ error: "no price" }, { status: result.status });
        recipe = result.body as RecipeDetail;
      } else {
        // Only the recipe page: its ingredient tiles carry the prices. The
        // recipe route may also fetch the product page of an ingredient
        // without a name, which a price does not need and which, for a grid of
        // cards, could set off Picnic's rate limit.
        try {
          const client = buildPicnicClient(this.desk.session.token!, this.desk.session.country);
          recipe = mapRecipeDetails(await client.recipe.getRecipe(id, { resolveIngredientNames: false }));
        } catch (err) {
          if (isApiAuthError(err)) return signedOut();
          return NextResponse.json({ error: "Picnic did not send the recipe." }, { status: 502 });
        }
      }
      if (account !== this.#account) return signedOut();
      const price = recipePrice(recipe);
      const entry: RecipePrice = {
        id,
        total: price.total,
        perServing: price.perServing,
        portions: price.portions,
        at: new Date((this.desk.options.now ?? Date.now)()).toISOString(),
      };
      const prices = (this.#recipePrices ??= {});
      prices[id] = entry;
      const ids = Object.keys(prices);
      if (ids.length > RECIPE_PRICES_MAX) {
        ids.sort((a, b) => prices[a].at.localeCompare(prices[b].at));
        for (const old of ids.slice(0, ids.length - RECIPE_PRICES_MAX)) delete prices[old];
      }
      this.desk.store.writeSoon("recipe_prices.json", prices);
      return NextResponse.json(entry);
    } finally {
      // Hand the slot straight to the next one waiting, or give it back.
      const next = this.#priceWaiting.shift();
      if (next) next();
      else this.#priceSlots += 1;
    }
  }

  /** After signing out: nothing of the old account may show for the next one. */
  forgetAccountData(): void {
    this.#account += 1;
    this.#historyBuild = null;
    this.#priceRuns.clear();
    this.#recipePrices = {};
    this.desk.store.remove("recipe_prices.json");
    this.desk.store.remove("history.json");
    this.pictures.forget();
    this.desk.payments.forget();
  }

  // ─── Self-check ───────────────────────────────────────────────────────────

  async #selfcheck(): Promise<Response> {
    if (!this.desk.session.signedIn && !this.desk.options.demo) return signedOut();
    const checks: Check[] = [];
    const run = async (key: CheckKey, name: string, step: () => Promise<string>) => {
      const started = Date.now();
      try {
        const detail = await step();
        checks.push({ key, name, ok: true, ms: Date.now() - started, detail });
      } catch (err) {
        checks.push({ key, name, ok: false, ms: Date.now() - started, detail: err instanceof Error ? err.message : String(err) });
      }
    };
    const get = async (path: string) => {
      const result = await this.desk.internal(path);
      if (result.status !== 200) {
        const message = isObject(result.body) && typeof result.body.error === "string" ? result.body.error : "";
        throw new Error(`${result.status} ${message}`.trim());
      }
      return result.body;
    };

    let products: Product[] = [];
    await run("account", "Account", async () => {
      const profile = (await get("user/profile")) as ProfileData;
      return profile.name ? `Signed in as ${profile.name}` : "Signed in";
    });
    await run("access", "Who may use it", async () => {
      const owner = this.desk.session.owner;
      const others = (this.desk.options.allowedUsers ?? []).filter((name) => name.trim());
      if (!this.desk.options.ingressOnly) return "anyone who can reach the app (not running under Home Assistant)";
      if (!owner) {
        throw new Error(
          "anyone in Home Assistant: this sign-in is not tied to a Home Assistant user. Sign out and in again to tie it to you."
        );
      }
      return `${owner.displayName || owner.name}${others.length ? ` and ${others.join(", ")}` : " only"}`;
    });
    await run("search", "Search", async () => {
      const word = SELF_CHECK_WORD[this.desk.session.country];
      const result = (await get(`search?${new URLSearchParams({ q: word })}`)) as SearchApiResponse;
      products = result.products ?? [];
      if (!products.length) throw new Error(`no products for “${word}”`);
      return `${products.length} products for “${word}”`;
    });
    await run("product", "Product page", async () => {
      if (!products.length) throw new Error("skipped: search found nothing");
      const detail = (await get(`product/${encodeURIComponent(products[0].id)}`)) as ProductDetail;
      const parts = [
        detail.description ? "description" : "",
        detail.infoSections?.length ? `${detail.infoSections.length} sections` : "",
        detail.nutritionRows?.length ? "nutrition" : "",
        detail.allergens?.confirmed?.length || detail.allergens?.mayContain?.length ? "allergens" : "",
      ].filter(Boolean);
      return `${detail.name}: ${parts.join(", ") || "name and price only"}`;
    });
    await run("pictures", "Pictures", async () => {
      const sample = products.slice(0, 4).filter((p) => p.imageId);
      if (!sample.length) throw new Error("skipped: no product pictures to try");
      if (this.desk.options.demo) return `${sample.length} of ${sample.length} loaded`;
      const results = await Promise.all(
        sample.map((p) => this.pictures.load(p.imageId, "product", this.desk.session.country, true))
      );
      const loaded = results.filter((r) => r.picture);
      const variants = [...new Set(loaded.map((r) => r.picture!.variant))].join(", ");
      const failed = results.find((r) => !r.picture);
      const failure = failed ? `; failed: ${failed.tried.map((t) => `${t.variant} → ${t.outcome}`).join(", ")}` : "";
      const kept = this.pictures.stored;
      const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;
      const store = kept.enabled
        ? `; ${kept.count} kept on this computer (${mb(kept.bytes)} of ${mb(kept.maxBytes)})`
        : "";
      if (!loaded.length) throw new Error(`none of ${sample.length} loaded from Picnic${failure}${store}`);
      return `${loaded.length} of ${sample.length} loaded from Picnic (${variants})${failure}${store}`;
    });
    await run("basket", "Basket", async () => {
      const cart = (await get("cart")) as CartData;
      return `${cart.totalCount} items`;
    });
    await run("slots", "Delivery slots", async () => {
      const picker = (await get("cart/delivery-slots")) as DeliverySlotPickerData;
      const days = picker.dayGroups ?? [];
      const count = days.reduce((n, d) => n + d.greenSlots.length + d.regularSlots.length, 0);
      return `${count} slots over ${days.length} days`;
    });
    await run("categories", "Categories", async () => {
      const page = (await get("rsc-pages?pageId=category-tree-root")) as RscPageModel;
      return `${page.nodes?.length ?? 0} sections`;
    });
    await run("recipes", "Recipes", async () => {
      const book = (await get("cookbook")) as CookbookApiResponse;
      return `${book.recipes?.length ?? 0} recipes in ${book.categories?.length ?? 0} categories`;
    });
    await run("deliveries", "Deliveries", async () => {
      const list = (await get("deliveries")) as DeliveriesApiResponse;
      return `${list.deliveries?.length ?? 0} deliveries`;
    });
    return NextResponse.json({ checks });
  }

  // ─── What Picnic sent ─────────────────────────────────────────────────────

  async #raw(request: NextRequest): Promise<Response> {
    if (!this.desk.session.signedIn && !this.desk.options.demo) return signedOut();
    const page = request.nextUrl.searchParams.get("page") ?? "";
    if (!PAGE_ID.test(page)) return error("page must be a Picnic page id", 400);
    let content: unknown;
    if (this.desk.options.demo) {
      content = { demo: true, page };
    } else {
      try {
        const client = buildPicnicClient(this.desk.session.token!, this.desk.session.country);
        content = await client.sendRequest("GET", `/pages/${page}`, null, { includePicnicHeaders: true });
      } catch (err) {
        if (isApiAuthError(err)) return signedOut();
        return error(`Picnic answered: ${err instanceof Error ? err.message.slice(0, 300) : "unknown error"}`, 502);
      }
    }
    const isText = typeof content === "string";
    const file = `picnic-${page.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 60)}.${isText ? "txt" : "json"}`;
    return new NextResponse(isText ? (content as string) : JSON.stringify(content, null, 2), {
      headers: {
        "content-type": isText ? "text/plain; charset=utf-8" : "application/json",
        "content-disposition": `attachment; filename="${file}"`,
      },
    });
  }
}

class HistoryError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    super(`history: ${status}`);
  }
}

/**
 * Pictures for the demo shop, drawn here so it works offline: a product's
 * first letter on a pale disc, and a few circles for a recipe.
 */
function demoPicture(id: string) {
  if (!/^demo-[a-z0-9-]{1,60}$/.test(id)) return null;
  const key = id.slice(5);
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  // Mix, so names that differ in one letter look different.
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  const hue = hash % 360;
  let svg: string;
  if (key.startsWith("recipe-")) {
    const circles = [0, 1, 2, 3]
      .map((i) => {
        const h = (hue + i * 47) % 360;
        return `<circle cx="${30 + ((hash >>> (i * 3)) % 140)}" cy="${40 + ((hash >>> (i * 5)) % 70)}" r="${18 + ((hash >>> i) % 22)}" fill="hsl(${h} 55% 60%)"/>`;
      })
      .join("");
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="hsl(${hue} 40% 90%)"/>${circles}</svg>`;
  } else {
    const product = productById(key);
    const aisle = L1_CATEGORIES.find((c) => `l1-${c.id}` === key)?.name;
    const name = product?.name ?? aisle ?? key.replace(/^cat-/, "");
    const letter = (name.match(/[A-Za-zÀ-ž]/)?.[0] ?? "?").toUpperCase();
    svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="hsl(${hue} 45% 92%)"/>` +
      `<circle cx="50" cy="50" r="32" fill="hsl(${hue} 50% 62%)"/>` +
      `<text x="50" y="62" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="700" fill="hsl(${hue} 60% 22%)">${letter}</text></svg>`;
  }
  return { data: Buffer.from(svg), type: "image/svg+xml", variant: "demo" };
}
