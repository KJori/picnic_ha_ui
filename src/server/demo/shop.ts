/**
 * A demo shop that answers the same /api/... routes as picnic-web, from the
 * catalogue in data.ts and an in-memory basket. It is what the browser tests
 * run against, and what PICNIC_DEMO=1 shows. Answers are typed with
 * picnic-web's types; nothing here talks to Picnic.
 *
 * Sign in with any token, or with any e-mail address and a password; the
 * password "2fa" asks for a verification code, which is 123456.
 */
import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME, readAuthToken } from "@/lib/core/auth";
import type {
  CheckoutIssueApiResponse,
  CheckoutStartData,
  PaymentProfileData,
} from "@/lib/core/checkout-types";
import type { DeliverySlotData, DeliverySlotPickerData, SlotDayGroup } from "@/lib/core/delivery-slot-types";
import type {
  DeliveryDetailData,
  DeliveryListItem,
  DeliveryTrackingData,
  ParcelDetailData,
  ParcelsPageData,
} from "@/lib/core/delivery-types";
import type {
  ApiErrorResponse,
  AuthApiResponse,
  CartData,
  CartFooterData,
  CartItem,
  CategoryProductsApiResponse,
  CookbookApiResponse,
  IngredientEditData,
  MealPlanSearchResponse,
  MealPlanShoppingListResponse,
  PromotionGroupApiResponse,
  PromotionsApiResponse,
  RecipeDetail,
  RecipeItem,
  SearchApiResponse,
  SuggestionsApiResponse,
} from "@/lib/core/types";
import { COUNTRY_COOKIE_NAME } from "@/lib/core/types";
import type { ProfileData } from "@/lib/core/user-types";
import {
  formatBannerText,
  formatDayTabLabel,
  formatDeliveryWindowText,
  formatEtaText,
} from "@/lib/delivery/format-delivery-window";
import type { RscPageModel } from "@/lib/rsc/rsc-page-types";

import {
  L1_CATEGORIES,
  L2_PRODUCTS,
  PRODUCTS,
  RECIPE_CATEGORIES,
  RECIPES,
  img,
  plainProduct,
  productById,
  productDetail,
  recipeById,
  recipeIngredients,
} from "./data";

type Json = NextResponse<unknown>;
const ok = <T>(body: T): Json => NextResponse.json(body);
const fail = (error: string, status: number, code?: ApiErrorResponse["code"]): Json =>
  NextResponse.json<ApiErrorResponse>(code ? { error, code } : { error }, { status });
const expired = () => fail("Your token has expired", 401, "TOKEN_EXPIRED");

const cookie = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: AUTH_COOKIE_MAX_AGE_SECONDS };

type Line = { productId: string; quantity: number; group: string | null };

/** Everything the demo remembers, per server start. */
export class DemoState {
  lines: Line[] = [];
  slotId: string | null = null;
  explicitSlot = false;
  savedRecipes = new Set<string>([RECIPES[0].id]);
  ingredientChoice = new Map<string, string>();
  cancelled = new Set<string>();
  rated = new Set<string>();
  checkouts = new Map<string, { orderId: string; polls: number; cancelled: boolean }>();
  orders = 0;
  /** The checkout start fails once with an age check while the basket holds this product. */
  ageChecked = false;

  constructor(readonly now: () => number = Date.now) {}
}

export function demoShop(state = new DemoState()) {
  return async (request: NextRequest, segments: string[]): Promise<Json | null> => {
    const route = segments.join("/");
    const method = request.method;

    if (route.startsWith("auth/")) return auth(request, segments[1]);
    if (!readAuthToken(request)) return expired();

    const q = request.nextUrl.searchParams;
    const body = async () => (method === "GET" ? null : await request.json().catch(() => null));

    switch (`${method} ${segments[0]}`) {
      case "GET search": {
        if (segments.length !== 1) break;
        const query = (q.get("q") ?? "").trim().toLowerCase();
        if (!query) return fail("Missing query", 400);
        return ok<SearchApiResponse>(search(query));
      }
      case "GET suggestions": {
        const query = (q.get("q") ?? "").trim().toLowerCase();
        const words = [...new Set(PRODUCTS.flatMap((p) => p.words))].filter((w) => w.startsWith(query));
        return ok<SuggestionsApiResponse>({
          query,
          suggestions: query.length < 2 ? [] : words.slice(0, 6).map((w) => ({ id: w, suggestion: w })),
        });
      }
      case "GET product": {
        const detail = segments[1] ? productDetail(segments[1]) : null;
        return detail ? ok(detail) : fail("Product not found", 404);
      }
      case "GET rsc-pages":
        if (q.get("pageId") !== "category-tree-root") return fail("Failed to load the page. Please try again later.", 502);
        return ok<RscPageModel>(categoryTree());
      case "GET categories": {
        const id = segments[1];
        if (segments[2] === "subcategories") {
          const l1 = L1_CATEGORIES.find((c) => c.id === id);
          return l1 ? ok({ title: l1.name, subcategories: l1.children }) : fail("Failed to load subcategories.", 502);
        }
        if (segments[2] === "products") {
          const ids = L2_PRODUCTS[id];
          if (!ids) return fail("Failed to load products.", 502);
          const name = L1_CATEGORIES.flatMap((c) => c.children).find((c) => c.id === id)?.name ?? null;
          return ok<CategoryProductsApiResponse>({
            title: name,
            products: ids.map((pid) => plainProduct(productById(pid)!)),
            sections: [],
          });
        }
        break;
      }
      case "GET pages": {
        const pageId = q.get("pageId") ?? "";
        const products = PRODUCTS.filter((p) => p.promoBadge || p.priceRanges).map(plainProduct);
        return ok<CategoryProductsApiResponse>({
          title: pageId === "basket-recommendations" ? "Niets vergeten?" : "",
          products,
          sections: [
            { title: "Acties", products: products.filter((p) => p.promoBadge) },
            { title: "Meer voor minder", products: products.filter((p) => p.priceRanges) },
          ],
        });
      }
      case "GET cart":
        if (segments[1] === "footer") return ok<CartFooterData>(footer(state));
        if (segments[1] === "delivery-slots") return ok<DeliverySlotPickerData>(slots(state));
        if (segments[1] === "checkout" && segments[2] === "payment-profile") return ok<PaymentProfileData>(paymentProfile());
        if (segments[1] === "checkout" && segments[2] === "status") return checkoutStatus(state, q.get("transactionId"));
        return ok<CartData>(cart(state));
      case "POST cart":
        return cartPost(state, segments, await body(), request.nextUrl.origin);
      case "DELETE cart":
        state.lines = [];
        return ok<CartData>(cart(state));
      case "GET cookbook":
        return cookbook(state, segments[1], q);
      case "GET recipe": {
        if (segments[1] === "saved") return ok({ recipeIds: [...state.savedRecipes] });
        const recipe = recipeById(segments[1] ?? "");
        if (!recipe) return fail("Recipe not found", 404);
        if (segments[2] === "ingredient") return ok<IngredientEditData>(ingredientEdit(state, segments[1], segments[3]));
        const portions = Number(q.get("portions")) || recipe.portions;
        return ok<RecipeDetail>(recipeDetail(state, segments[1], portions));
      }
      case "POST recipe":
        return recipePost(state, segments, await body());
      case "POST meal-plan":
        return mealPlan(segments[1], await body());
      case "GET deliveries":
        return deliveriesGet(state, segments, q);
      case "POST deliveries":
        return deliveriesPost(state, segments, await body());
      case "GET parcels":
        return segments[1] ? ok<ParcelDetailData>(parcel(segments[1])) : ok<ParcelsPageData>(parcels());
      case "GET user":
        if (segments[1] === "profile") {
          return ok<ProfileData>({
            name: "Demo Klant",
            addressLine: "Demostraat 1",
            avatarUrl: null,
            hasMembership: false,
            menu: [
              { id: "orders", deepLink: null },
              { id: "parcels", deepLink: null },
            ],
          });
        }
        break;
      case "GET promotions":
        return segments[1] ? promotionGroup(segments[1]) : ok<PromotionsApiResponse>(promotions());
    }
    return fail("Not found.", 404);
  };
}

// ─── Sign-in ──────────────────────────────────────────────────────────────────

async function auth(request: NextRequest, step: string | undefined): Promise<Json> {
  const body = await request.json().catch(() => null);
  const country = String(body?.countryCode ?? "").toUpperCase();
  const signIn = (token: string) => {
    const response = NextResponse.json<AuthApiResponse>({ success: true });
    response.cookies.set(AUTH_COOKIE_NAME, token, cookie);
    if (["NL", "DE", "FR"].includes(country)) response.cookies.set(COUNTRY_COOKIE_NAME, country, cookie);
    return response;
  };
  switch (step) {
    case "login":
      if (typeof body?.token !== "string" || !body.token.trim()) {
        return NextResponse.json<AuthApiResponse>({ success: false, error: "TOKEN_INVALID" });
      }
      return signIn(`demo-${body.token.trim().slice(0, 20)}`);
    case "login-credentials":
      if (!body?.email || !body?.password) {
        return NextResponse.json<AuthApiResponse>({ success: false, error: "CREDENTIALS_INVALID" });
      }
      if (body.password === "wrong") {
        return NextResponse.json<AuthApiResponse>({ success: false, error: "CREDENTIALS_INVALID" });
      }
      if (body.password === "2fa") {
        return NextResponse.json<AuthApiResponse>({ success: false, error: "2FA_REQUIRED", partialToken: "demo-partial" });
      }
      return signIn("demo-credentials");
    case "verify-2fa":
      if (body?.partialToken !== "demo-partial" || body?.code !== "123456") {
        return NextResponse.json<AuthApiResponse>({ success: false, error: "2FA_INVALID" });
      }
      return signIn("demo-2fa");
    case "logout": {
      const response = NextResponse.json<AuthApiResponse>({ success: true });
      response.cookies.set(AUTH_COOKIE_NAME, "", { ...cookie, maxAge: 0 });
      return response;
    }
  }
  return fail("Not found.", 404);
}

// ─── Search and categories ────────────────────────────────────────────────────

function search(query: string): SearchApiResponse {
  const words = query.split(/\s+/);
  const hits = PRODUCTS.filter((p) =>
    words.every((w) => p.words.some((pw) => pw.startsWith(w)) || p.name.toLowerCase().includes(w))
  );
  const byCategory = new Map<string, typeof hits>();
  for (const hit of hits) byCategory.set(hit.category, [...(byCategory.get(hit.category) ?? []), hit]);
  return {
    query,
    products: hits.map(plainProduct),
    sections:
      byCategory.size > 1
        ? [...byCategory].map(([category, list]) => ({
            title: category[0].toUpperCase() + category.slice(1),
            products: list.map(plainProduct),
          }))
        : [],
  };
}

function categoryTree(): RscPageModel {
  const row = (title: string, image: string, deeplink: string, label?: string) => ({
    type: "row-item",
    testID: `row-${title}`,
    title,
    image,
    deeplink,
    ...(label ? { label: { title: label, backgroundColor: "YELLOW2", textColor: "#333333" } } : {}),
  });
  return {
    pageId: "category-tree-root",
    tokens: { YELLOW2: "#FBD92B", GOLD1: "#95710F" },
    nodes: [
      {
        id: "list",
        component: "vertical-list",
        modulePath: "./logical-components/sections/vertical-list/vertical-list.tsx",
        children: [],
        props: {
          items: [
            row("Acties", img("cat-acties"), "app.picnic://store/page;id=promo-page-root", "12 producten"),
            { type: "section-title", title: "Alle categorieën" },
            ...L1_CATEGORIES.map((c) =>
              row(c.name, img(`l1-${c.id}`), `app.picnic://store/page;id=subcategory-page,category_id=${c.id}`)
            ),
          ],
        },
      },
    ],
  };
}

/** The promotions page: the offers, and a card for an offer on several products. */
function promotions(): PromotionsApiResponse {
  const offers = PRODUCTS.filter((p) => p.promoBadge).map(plainProduct);
  const tiers = PRODUCTS.filter((p) => p.priceRanges).map(plainProduct);
  return {
    sections: [
      {
        title: "Acties",
        products: offers,
        groups: [{ id: "demo-koffie", name: "Koffie van Lavazza", example: "Koffiebonen espresso", label: "18% korting" }],
      },
      { title: "Meer voor minder", products: tiers, groups: [] },
    ],
  };
}

function promotionGroup(id: string): Json {
  if (id !== "demo-koffie") return fail("Failed to load the promotion. Please try again later.", 502);
  return ok<PromotionGroupApiResponse>({
    name: "Koffie van Lavazza",
    products: PRODUCTS.filter((p) => p.category === "koffie").map(plainProduct),
  });
}

// ─── Basket ───────────────────────────────────────────────────────────────────

function slotList(state: DemoState): DeliverySlotData[] {
  const out: DeliverySlotData[] = [];
  const start = new Date(state.now());
  start.setHours(0, 0, 0, 0);
  for (let day = 1; day <= 4; day++) {
    for (const [hour, green] of [
      [8, false],
      [17, true],
      [19, false],
    ] as const) {
      const from = new Date(start);
      from.setDate(start.getDate() + day);
      from.setHours(hour, 0, 0, 0);
      const to = new Date(from);
      to.setHours(hour + 1);
      const cutOff = new Date(from);
      cutOff.setDate(from.getDate() - 1);
      cutOff.setHours(22);
      const slotId = `slot-${day}-${hour}`;
      out.push({
        slotId,
        windowStart: from.toISOString(),
        windowEnd: to.toISOString(),
        cutOffTime: cutOff.toISOString(),
        isAvailable: !(day === 1 && hour === 8),
        isSelected: slotId === state.slotId,
        isGreenChoice: green,
        minimumOrderValue: 3500,
      });
    }
  }
  return out;
}

function slots(state: DemoState): DeliverySlotPickerData {
  const all = slotList(state);
  const days = new Map<string, DeliverySlotData[]>();
  for (const s of all) {
    const date = s.windowStart.slice(0, 10);
    days.set(date, [...(days.get(date) ?? []), s]);
  }
  const dayGroups: SlotDayGroup[] = [...days].map(([date, list]) => {
    const { dayLabel, dateLabel } = formatDayTabLabel(date, "NL");
    return {
      date,
      dayLabel,
      dateLabel,
      greenSlots: list.filter((s) => s.isGreenChoice),
      regularSlots: list.filter((s) => !s.isGreenChoice),
    };
  });
  return { dayGroups, selectedSlot: selectedSlot(state, all) };
}

function selectedSlot(state: DemoState, all = slotList(state)) {
  const chosen = all.find((s) => s.slotId === state.slotId) ?? all.find((s) => s.isAvailable)!;
  return {
    slotId: chosen.slotId,
    state: state.explicitSlot ? "EXPLICIT" : "IMPLICIT",
    windowStart: chosen.windowStart,
    windowEnd: chosen.windowEnd,
    isExplicitSelection: state.explicitSlot,
  };
}

function lineItem(line: Line, index: number): CartItem {
  const product = productById(line.productId)!;
  const tier = product.priceRanges?.filter((t) => t.quantity <= line.quantity).at(-1);
  const unit = tier ? tier.pricePerUnit : product.displayPrice;
  const regular = product.originalPrice ?? product.displayPrice;
  return {
    id: `line-${index}-${product.id}`,
    productId: product.id,
    name: product.name,
    unitQuantity: product.unitQuantity,
    imageId: product.imageId,
    displayPrice: unit * line.quantity,
    originalPrice: unit < regular ? regular * line.quantity : null,
    quantity: line.quantity,
    maxCount: product.maxCount,
    badges: tier ? [{ text: `${tier.quantity} voor ${((tier.pricePerUnit * tier.quantity) / 100).toFixed(2).replace(".", ",")}`, variant: "bundle" }] : [],
    isUnavailable: product.isUnavailable,
    unavailableExplanation: product.unavailableReason,
    basketGroupId: line.group,
  };
}

export function cart(state: DemoState): CartData {
  const items = state.lines.map(lineItem);
  const available = items.filter((i) => !i.isUnavailable);
  const goods = available.reduce((sum, i) => sum + i.displayPrice, 0);
  const promoSavings = available.reduce((sum, i) => sum + Math.max(0, (i.originalPrice ?? i.displayPrice) - i.displayPrice), 0);
  const bottles = available.filter((i) => i.productId === "s1006").reduce((n, i) => n + i.quantity, 0);
  const depositBreakdown = bottles ? [{ type: "BOTTLE", value: 15, count: bottles, total: 15 * bottles }] : [];
  const depositTotal = depositBreakdown.reduce((n, d) => n + d.total, 0);
  const slot = selectedSlot(state);
  const groups = [...new Set(state.lines.map((l) => l.group).filter((g): g is string => g !== null))];
  return {
    items,
    totalPrice: goods + depositTotal,
    totalCount: available.reduce((n, i) => n + i.quantity, 0),
    totalDiscount: promoSavings,
    depositTotal,
    depositBreakdown,
    membershipSavings: 0,
    promoSavings,
    fees: [],
    minimumOrderValue: 3500,
    selectedSlot: slot,
    deliveryBannerText: state.explicitSlot
      ? (formatBannerText(slot.windowStart, slot.windowEnd, "NL") ?? "Kies je bezorgmoment")
      : "Kies je bezorgmoment",
    recipeGroups: groups.map((id) => {
      const recipe = recipeById(id);
      return { id, title: recipe?.name ?? "Recept", imageId: img(`recipe-${id.slice(-1)}`) };
    }),
  };
}

function footer(state: DemoState): CartFooterData {
  const total = cart(state).totalPrice;
  return {
    loyaltyPoints: total > 0 ? { label: { text: "Spaarpunten", color: null }, value: { text: `${Math.floor(total / 100)} punten`, color: "#295813" } } : null,
    recommendations: {
      title: "Niets vergeten?",
      pageId: "basket-recommendations",
      tiles: PRODUCTS.filter((p) => !p.isUnavailable)
        .slice(0, 6)
        .map((p) => ({ productId: p.id, imageId: p.imageId, backgroundColor: "#f5f1ec", hasPromo: Boolean(p.promoBadge) })),
    },
  };
}

function addLine(state: DemoState, productId: string, count: number, group: string | null = null) {
  const line = state.lines.find((l) => l.productId === productId);
  if (line) {
    line.quantity += count;
    if (group && !line.group) line.group = group;
  } else {
    state.lines.push({ productId, quantity: count, group });
  }
}

function cartPost(state: DemoState, segments: string[], body: any, origin: string): Json {
  if (segments[1] === "delivery-slots") {
    const slot = slotList(state).find((s) => s.slotId === body?.slotId);
    if (!slot) return fail("slotId is required", 400);
    if (!slot.isAvailable) return fail("Dit bezorgmoment is vol.", 409);
    state.slotId = slot.slotId;
    state.explicitSlot = true;
    return ok<CartData>(cart(state));
  }
  if (segments[1] === "checkout") return checkout(state, segments[2], body, origin);
  if (segments.length !== 1) return fail("Not found.", 404);

  if (!body?.productId || !body?.action || typeof body.count !== "number") {
    return fail("Missing required fields: productId, action, count", 400);
  }
  if (body.action !== "add" && body.action !== "remove") return fail('action must be "add" or "remove"', 400);
  const product = productById(body.productId);
  if (!product) return fail("Failed to update cart. Please try again later.", 502);
  if (body.action === "add") {
    if (product.isUnavailable) return fail("Failed to update cart. Please try again later.", 502);
    const current = state.lines.find((l) => l.productId === product.id)?.quantity ?? 0;
    addLine(state, product.id, Math.min(body.count, product.maxCount - current));
  } else {
    const line = state.lines.find((l) => l.productId === product.id);
    if (line) {
      line.quantity -= body.count;
      if (line.quantity <= 0) state.lines = state.lines.filter((l) => l !== line);
    }
  }
  return ok<CartData>(cart(state));
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

function paymentProfile(): PaymentProfileData {
  return {
    preferredPaymentOptionId: "ideal-1",
    storedOptions: [{ id: "ideal-1", displayName: "iDEAL", account: "NL** DEMO 0000 0000 01", paymentMethod: "IDEAL", iconUrl: "" }],
  };
}

function checkout(state: DemoState, step: string | undefined, body: any, origin: string): Json {
  const current = cart(state);
  switch (step) {
    case "start": {
      if (current.totalCount === 0) return fail("Failed to start checkout. Please try again later.", 502);
      const hasCoffee = current.items.some((i) => i.productId === "s1024");
      if (hasCoffee && !state.ageChecked && body?.resolveKey !== "age-ok") {
        return NextResponse.json<CheckoutIssueApiResponse>(
          {
            issue: {
              code: "AGE_VERIFICATION",
              title: "Ben je 18 of ouder?",
              message: "Er zit een product in je mandje waarvoor je 18 moet zijn. (Demo: dit vraagt de winkel bij koffie.)",
              resolveKey: "age-ok",
              blocking: true,
              issueType: "AGE_VERIFICATION",
              requiresAgeVerification: true,
            },
          },
          { status: 409 }
        );
      }
      if (body?.resolveKey === "age-ok") state.ageChecked = true;
      state.orders += 1;
      const data: CheckoutStartData = {
        orderId: `demo-order-${state.orders}`,
        totalPrice: current.totalPrice,
        totalCount: current.totalCount,
        totalDeposit: current.depositTotal,
        totalSavings: current.promoSavings,
        transactionExpiry: new Date(state.now() + 15 * 60 * 1000).toISOString(),
      };
      return ok(data);
    }
    case "initiate": {
      if (typeof body?.orderId !== "string" || !body.orderId) return fail("orderId is required", 400);
      const transactionId = `demo-tx-${state.checkouts.size + 1}`;
      state.checkouts.set(transactionId, { orderId: body.orderId, polls: 0, cancelled: false });
      // No bank in the demo: the "bank" sends the browser straight back, as a real one does after paying.
      return ok({ paymentId: `demo-pay-${state.checkouts.size}`, transactionId, redirectUrl: `${origin}/checkout/return` });
    }
    case "confirm": {
      if (typeof body?.orderId !== "string" || !body.orderId) return fail("orderId is required", 400);
      const tx = body.transactionId ? state.checkouts.get(body.transactionId) : null;
      if (tx && tx.polls < 2) return fail("Payment not completed yet. Cannot confirm order.", 409);
      state.lines = [];
      state.explicitSlot = false;
      return ok({ success: true, orderId: body.orderId });
    }
    case "cancel": {
      const tx = typeof body?.transactionId === "string" ? state.checkouts.get(body.transactionId) : null;
      if (!tx) return fail("transactionId is required", 400);
      tx.cancelled = true;
      return ok({ success: true });
    }
  }
  return fail("Not found.", 404);
}

function checkoutStatus(state: DemoState, transactionId: string | null): Json {
  if (!transactionId) return fail("transactionId is required", 400);
  const tx = state.checkouts.get(transactionId);
  if (!tx) return fail("Failed to load checkout status. Please try again later.", 502);
  tx.polls += 1;
  const checkoutStatus = tx.cancelled ? "CANCELLED" : tx.polls >= 2 ? "FINISHED" : "PENDING";
  return ok({ checkoutStatus });
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

const recipeItem = (r: (typeof RECIPES)[number]): RecipeItem => ({
  id: r.id,
  name: r.name,
  imageId: img(`recipe-${r.id.slice(-1)}`),
  cookingTimeMinutes: r.minutes,
});

function cookbook(state: DemoState, sub: string | undefined, q: URLSearchParams): Json {
  if (sub === "counts") {
    const counts: Record<string, number> = { __featured__: RECIPES.length, __saved__: state.savedRecipes.size };
    for (const c of RECIPE_CATEGORIES) counts[c.id] = RECIPES.filter((r) => r.categories.includes(c.id)).length;
    return ok(counts);
  }
  if (sub === "search") {
    const query = (q.get("q") ?? "").toLowerCase();
    return ok<CookbookApiResponse>({
      categories: [],
      recipes: RECIPES.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.ingredients.some((i) => productById(i.product)!.name.toLowerCase().includes(query))
      ).map(recipeItem),
    });
  }
  const category = q.get("category");
  let list = RECIPES;
  if (category === "__saved__") list = RECIPES.filter((r) => state.savedRecipes.has(r.id));
  else if (category) {
    if (!/^recipe-cattree-[\w-]+$/.test(category)) return fail("Invalid category ID", 400);
    list = RECIPES.filter((r) => r.categories.includes(category));
  }
  return ok<CookbookApiResponse>({ categories: category ? [] : RECIPE_CATEGORIES, recipes: list.map(recipeItem) });
}

function recipeDetail(state: DemoState, id: string, portions: number): RecipeDetail {
  const recipe = recipeById(id)!;
  const ingredients = recipeIngredients(recipe, portions).map((ing) => {
    const swapped = ing.ingredientId ? state.ingredientChoice.get(`${id}:${ing.ingredientId}`) : undefined;
    const product = swapped ? productById(swapped) : null;
    return product
      ? { ...ing, id: product.id, name: product.name, imageId: product.imageId, displayPrice: product.displayPrice, unitQuantity: product.unitQuantity }
      : ing;
  });
  return {
    id,
    name: recipe.name,
    imageId: img(`recipe-${id.slice(-1)}`),
    cookingTimeMinutes: recipe.minutes,
    portions,
    ingredients,
    steps: recipe.steps,
    stepsPortionWarning: portions > 6 ? "Let op: de bereiding is geschreven voor 6 personen of minder." : null,
    recipeNutritionRows: [
      { label: "Energie", value: "520 kcal", isCategory: true, backgroundColor: null },
      { label: "Eiwitten", value: "21 g", isCategory: true, backgroundColor: "#f5f1ec" },
    ],
    allergens: {
      confirmed: [{ text: "Soja", backgroundColor: "#b40117", textColor: "#ffffff" }],
      mayContain: [{ text: "Gluten", backgroundColor: "#fbd92b", textColor: "#333333" }],
    },
  };
}

function ingredientEdit(state: DemoState, recipeId: string, slotId: string | undefined): IngredientEditData {
  const recipe = recipeById(recipeId)!;
  const ingredient = recipe.ingredients.find((i) => i.slot === slotId) ?? recipe.ingredients[0];
  const own = productById(ingredient.product)!;
  const chosen = state.ingredientChoice.get(`${recipeId}:${ingredient.slot}`) ?? own.id;
  const alternatives = PRODUCTS.filter((p) => p.category === own.category && p.id !== own.id).slice(0, 4);
  const tile = (p: (typeof PRODUCTS)[number]) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    imageId: p.imageId,
    displayPrice: p.isUnavailable ? 0 : p.displayPrice,
    originalPrice: p.originalPrice,
    promotionLabel: p.promoBadge?.text ?? null,
    unitQuantity: p.unitQuantity,
    tags: p.words.includes("vegan") ? ["Vegan"] : [],
    isUnavailable: p.isUnavailable,
    unavailableReason: p.unavailableReason,
  });
  return {
    ingredientId: ingredient.slot,
    subtitle: `${ingredient.text} volgens het originele recept`,
    groups: [
      { title: own.name, alternatives: [tile(own)] },
      { title: "Andere keuzes", alternatives: alternatives.map(tile) },
    ],
    selected: { [chosen]: 1 },
  };
}

function recipePost(state: DemoState, segments: string[], body: any): Json {
  const [, id, action, slotId] = segments;
  const recipe = recipeById(id ?? "");
  if (!recipe) return fail("Invalid recipe ID", 400);
  if (action === "save") {
    if (typeof body?.saved !== "boolean") return fail("saved must be a boolean", 400);
    if (body.saved) state.savedRecipes.add(id);
    else state.savedRecipes.delete(id);
    return ok({ saved: body.saved });
  }
  if (action === "add-to-cart") {
    const portions = typeof body?.portions === "number" && body.portions > 0 ? body.portions : recipe.portions;
    const chosen = Array.isArray(body?.selectedIngredients)
      ? body.selectedIngredients
      : recipeIngredients(recipe, portions).filter((i) => !i.isCondiment).map((i) => ({ id: i.id, count: i.quantity }));
    for (const item of chosen) {
      if (item.count > 0 && productById(item.id) && !productById(item.id)!.isUnavailable) addLine(state, item.id, item.count, id);
    }
    return ok({ success: true });
  }
  if (action === "ingredient" && slotId) {
    const quantities = body?.quantities;
    if (typeof quantities !== "object" || quantities === null) return fail("quantities is required", 400);
    const picked = Object.entries(quantities as Record<string, number>).find(([, n]) => n > 0)?.[0];
    if (picked && productById(picked)) state.ingredientChoice.set(`${id}:${slotId}`, picked);
    return ok({ success: true });
  }
  return fail("Not found.", 404);
}

function mealPlan(step: string | undefined, body: any): Json {
  const people = Number.isInteger(body?.people) ? body.people : 0;
  if (step === "search") {
    const candidates: string[] = Array.isArray(body?.candidateIds) ? body.candidateIds : [];
    const fixed: string[] = Array.isArray(body?.fixedIds) ? body.fixedIds : [];
    const slots = Number.isInteger(body?.slots) ? body.slots : 0;
    if (slots < 1) return fail("slots must be at least 1", 400);
    if (people < 1 || people > 12) return fail("people must be between 1 and 12", 400);
    const picked = candidates.filter((c) => !fixed.includes(c) && recipeById(c)).slice(0, slots);
    return ok<MealPlanSearchResponse>({
      combinations: [{ recipeIds: picked, packagesSaved: picked.length > 1 ? 2 : 0, totalPriceCents: 1850 * picked.length }],
    });
  }
  if (step === "shopping-list") {
    const ids: string[] = Array.isArray(body?.recipeIds) ? body.recipeIds : [];
    const recipes = ids.map(recipeById).filter((r): r is NonNullable<typeof r> => r !== null);
    const seen = new Map<string, MealPlanShoppingListResponse["items"][number]>();
    for (const recipe of recipes) {
      for (const ing of recipeIngredients(recipe, people || 2).filter((i) => !i.isCondiment)) {
        const known = seen.get(ing.id);
        if (known) known.usedInRecipeIds.push(recipe.id);
        else
          seen.set(ing.id, {
            ingredientId: ing.ingredientId ?? ing.id,
            ownerSellingUnitId: ing.id,
            name: ing.name,
            imageId: ing.imageId,
            packagesNeeded: ing.quantity,
            unitPriceCents: ing.displayPrice,
            ownerRecipeId: recipe.id,
            usedInRecipeIds: [recipe.id],
          });
      }
    }
    const items = [...seen.values()];
    return ok<MealPlanShoppingListResponse>({
      recipes: recipes.map((r) => ({ id: r.id, name: r.name, imageId: img(`recipe-${r.id.slice(-1)}`) })),
      items,
      totalPriceCents: items.reduce((n, i) => n + i.unitPriceCents * i.packagesNeeded, 0),
      packagesSaved: items.filter((i) => i.usedInRecipeIds.length > 1).length,
    });
  }
  return fail("Not found.", 404);
}

// ─── Deliveries and parcels ───────────────────────────────────────────────────

function deliveryList(state: DemoState): DeliveryListItem[] {
  const day = 24 * 60 * 60 * 1000;
  const at = (offsetDays: number, hour: number) => {
    const d = new Date(state.now() + offsetDays * day);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const make = (id: string, status: string, offset: number, total: number, count: number): DeliveryListItem => ({
    id,
    status: state.cancelled.has(id) ? "CANCELLED" : status,
    creationTime: at(offset - 2, 12),
    windowStart: at(offset, 17),
    windowEnd: at(offset, 18),
    deliveryWindowText: formatDeliveryWindowText(at(offset, 17), at(offset, 18), "NL"),
    orderCount: 1,
    totalPrice: total,
    itemCount: count,
  });
  return [
    make("demo-delivery-current", "CURRENT", 0, 5412, 14),
    make("demo-delivery-1", "COMPLETED", -7, 6230, 18),
    make("demo-delivery-2", "COMPLETED", -14, 4875, 12),
    make("demo-delivery-3", "CANCELLED", -21, 3990, 9),
  ];
}

function deliveryDetail(state: DemoState, id: string): DeliveryDetailData | null {
  const summary = deliveryList(state).find((d) => d.id === id);
  if (!summary) return null;
  const picks: Record<string, [string, number][]> = {
    "demo-delivery-current": [["s1001", 1], ["s1004", 2], ["s1011", 1], ["s1024", 1]],
    "demo-delivery-1": [["s1001", 1], ["s1006", 2], ["s1011", 1], ["s1013", 2]],
    "demo-delivery-2": [["s1001", 2], ["s1008", 1], ["s1012", 1]],
    "demo-delivery-3": [["s1018", 1]],
  };
  const items = (picks[id] ?? []).map(([productId, quantity], i) => lineItem({ productId, quantity, group: null }, i));
  const total = items.reduce((n, i) => n + i.displayPrice, 0);
  return {
    id,
    status: summary.status,
    creationTime: summary.creationTime,
    windowStart: summary.windowStart,
    windowEnd: summary.windowEnd,
    deliveryWindowText: summary.deliveryWindowText,
    orders: [
      {
        id: `${id}-order`,
        items,
        totalPrice: total,
        checkoutTotalPrice: total,
        totalSavings: 0,
        totalDeposit: 0,
        membershipSavings: 0,
        cancellable: summary.status === "CURRENT",
        status: summary.status,
        creationTime: summary.creationTime,
        fees: [],
        depositBreakdown: [],
        payment: { paymentType: "iDEAL", redactedIban: "NL** DEMO 0000 0000 01", bankId: "DEMO" },
      },
    ],
    returnedContainers: summary.status === "COMPLETED" ? [{ type: "BOTTLE", name: "Statiegeldfles", quantity: 2, price: -30 }] : [],
    totalPrice: total,
    totalCount: items.reduce((n, i) => n + i.quantity, 0),
    totalDiscount: 0,
    depositTotal: 0,
    depositBreakdown: [],
    membershipSavings: 0,
    promoSavings: 0,
    fees: [],
    cancellable: summary.status === "CURRENT",
  };
}

function deliveriesGet(state: DemoState, segments: string[], q: URLSearchParams): Json {
  const status = q.get("status");
  if (segments.length === 1) {
    const all = deliveryList(state);
    return ok({ deliveries: status ? all.filter((d) => d.status === status) : all });
  }
  const id = segments[1];
  const detail = deliveryDetail(state, id);
  if (!detail) return fail("Failed to load delivery. Please try again later.", 502);
  const base = state.now();
  // picnic-api's delivery position, as the position route sends it.
  const position = {
    routeVersion: 1,
    inProgress: detail.status === "CURRENT",
    queryInterval: 15000,
    eta: base + 20 * 60_000,
    etaWindowStart: new Date(base + 15 * 60_000).toISOString(),
    etaWindowEnd: new Date(base + 25 * 60_000).toISOString(),
    routeTime: base - 60_000,
  };
  if (segments[2] === "position") return ok(position);
  if (segments[2] === "tracking") {
    const route = Array.from({ length: 12 }, (_, i) => ({ lat: 52.37 + i * 0.002, lng: 4.88 + i * 0.003, ts: base - (11 - i) * 60_000 }));
    const known = q.get("routeVersion") === String(position.routeVersion);
    return ok<DeliveryTrackingData>({
      routeVersion: position.routeVersion,
      scenarioInProgress: position.inProgress,
      queryInterval: position.queryInterval,
      eta: position.eta,
      etaWindowStart: position.etaWindowStart,
      etaWindowEnd: position.etaWindowEnd,
      etaText: formatEtaText(position.eta, "NL"),
      currentPosition: route[10],
      // Left out when the caller has this version already, as picnic-web does.
      route: known ? [] : route,
      driverName: "Sam",
      driverPhotoUrl: null,
      vehicleName: "Elektrisch busje",
      vehicleImageDataUrl: null,
      destination: { lat: 52.395, lng: 4.92, street: "Demostraat 1", city: "Amsterdam", postcode: "1000 AA" },
    });
  }
  if (segments.length === 2) return ok<DeliveryDetailData>(detail);
  return fail("Not found.", 404);
}

function deliveriesPost(state: DemoState, segments: string[], body: any): Json {
  const id = segments[1];
  const detail = id ? deliveryDetail(state, id) : null;
  if (!detail) return fail("Not found.", 404);
  switch (segments[2]) {
    case "cancel":
      if (!detail.cancellable) return fail("Failed to cancel delivery. Please try again later.", 502);
      state.cancelled.add(id);
      return ok({ success: true });
    case "invoice":
      return ok({ success: true });
    case "rating": {
      const rating = body?.rating;
      if (!Number.isInteger(rating) || rating < 0 || rating > 10) return fail("rating must be an integer between 0 and 10", 400);
      if (state.rated.has(id)) return fail("Delivery already rated", 409);
      state.rated.add(id);
      return ok({ success: true });
    }
  }
  return fail("Not found.", 404);
}

function parcels(): ParcelsPageData {
  return {
    title: "Pakketservice",
    subtitle: "Laat je pakketjes thuisbezorgen door Picnic",
    sections: [
      {
        title: "Verwerkt",
        parcels: [
          { id: "p1", name: "DHL-pakket", statusText: "Bezorgd", statusColor: "#308807", dateText: "3 oktober 2026", parcelId: "JVGL0000DEMO1" },
          { id: "p2", name: "PostNL-retour", statusText: "Opgehaald door Picnic", statusColor: null, dateText: "21 september 2026", parcelId: "3SDEMO0002" },
        ],
      },
    ],
  };
}

function parcel(id: string): ParcelDetailData {
  return {
    title: "Jouw pakketje",
    shipmentLabel: "Zendingsnummer:",
    shipmentNumber: id,
    copiedMessage: "Zendingsnummer gekopieerd!",
    steps: [
      { title: "Aangemeld", dateText: "Woensdag 1 oktober 2026", done: true, markerColor: "#295813", markerSize: 12, lineColor: "#295813" },
      { title: "Opgehaald door Picnic", dateText: "Donderdag 2 oktober 2026", done: true, markerColor: "#295813", markerSize: 12, lineColor: "#295813" },
      { title: "Bezorgd", dateText: "Vrijdag 3 oktober 2026", done: true, markerColor: "#295813", markerSize: 18, lineColor: null },
    ],
    footerText: "Dankjewel! Samen besparen we een onnodig ritje in de buurt.",
  };
}
