/**
 * The demo shop (which the browser tests run against), and small pieces with
 * rules of their own.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { packs, packsPrice, recipePrice } from "../src/shared/recipe-price";
import { demoShop } from "../src/server/demo/shop";
import { Pictures, pictureType } from "../src/server/pictures";
import { parseListLine } from "../src/ui/lib/list";
import type { RecipeIngredient } from "@/lib/core/types";
import { runDesk } from "./helpers";

test("the demo shop answers every route the page uses", async () => {
  const desk = await runDesk({ demo: demoShop() });
  try {
    assert.equal((await desk.get("/api/cart")).status, 401, "signed out first");
    assert.deepEqual((await desk.post("/api/auth/login-credentials", { email: "a@b.c", password: "2fa" })).body, {
      success: false,
      error: "2FA_REQUIRED",
    });
    assert.deepEqual((await desk.post("/api/auth/verify-2fa", { code: "123456" })).body, { success: true });
    const recipe = "64a000000000000000000001";
    const gets = [
      "/api/search?q=tofu",
      "/api/suggestions?q=to",
      "/api/product/s1004",
      "/api/rsc-pages?pageId=category-tree-root",
      "/api/categories/21001/subcategories",
      "/api/categories/22001/products",
      "/api/pages/products?pageId=basket-recommendations",
      "/api/pages/products?pageId=promo-group-deep-dive%3Fpromo_group_id%3Ddemo",
      "/api/cart",
      "/api/cart/footer",
      "/api/cart/delivery-slots",
      "/api/cart/checkout/payment-profile",
      "/api/cookbook",
      "/api/cookbook?category=recipe-cattree-vegan",
      "/api/cookbook?category=__saved__",
      "/api/cookbook/counts",
      "/api/cookbook/search?q=tofu",
      `/api/recipe/${recipe}`,
      `/api/recipe/${recipe}?portions=4`,
      `/api/recipe/${recipe}/ingredient/00000001-0000-4000-8000-000000000001`,
      "/api/recipe/saved",
      "/api/deliveries",
      "/api/deliveries?status=COMPLETED",
      "/api/deliveries/demo-delivery-current",
      "/api/deliveries/demo-delivery-current/position",
      "/api/deliveries/demo-delivery-current/scenario",
      "/api/parcels",
      "/api/parcels/JVGL0000DEMO1",
      "/api/user/profile",
      "/api/desk/history",
      "/api/desk/selfcheck",
      `/api/desk/recipe-price?id=${recipe}`,
      "/api/desk/image?id=demo-s1004",
    ];
    for (const path of gets) assert.equal((await desk.get(path)).status, 200, path);
    const checks = (await desk.get("/api/desk/selfcheck")).body.checks;
    assert.ok(checks.every((c: { ok: boolean }) => c.ok), JSON.stringify(checks));

    // A full order: basket, slot, age check, payment, confirmation.
    assert.equal((await desk.post("/api/cart", { productId: "s1024", action: "add", count: 4 })).status, 200);
    const slots = (await desk.get("/api/cart/delivery-slots")).body;
    const slot = slots.dayGroups[1].regularSlots[0];
    assert.equal((await desk.post("/api/cart/delivery-slots", { slotId: slot.slotId })).body.selectedSlot.isExplicitSelection, true);
    const issue = await desk.post("/api/cart/checkout/start", {});
    assert.equal(issue.status, 409);
    assert.equal(issue.body.issue.requiresAgeVerification, true);
    const started = await desk.post("/api/cart/checkout/start", { resolveKey: issue.body.issue.resolveKey });
    const payment = await desk.post("/api/cart/checkout/initiate", { orderId: started.body.orderId });
    const status = `/api/cart/checkout/status?transactionId=${payment.body.transactionId}`;
    assert.equal((await desk.get(status)).body.checkoutStatus, "PENDING");
    assert.equal((await desk.post("/api/cart/checkout/confirm", { orderId: started.body.orderId, transactionId: payment.body.transactionId })).status, 409);
    assert.equal((await desk.get(status)).body.checkoutStatus, "FINISHED");
    assert.equal((await desk.post("/api/cart/checkout/confirm", { orderId: started.body.orderId, transactionId: payment.body.transactionId })).status, 200);
    assert.equal((await desk.get("/api/cart")).body.totalCount, 0);

    // A recipe goes in as a recipe group.
    await desk.post(`/api/recipe/${recipe}/add-to-cart`, { portions: 2, selectedIngredients: [{ id: "s1019", ingredientId: "x", count: 1 }] });
    const cart = (await desk.get("/api/cart")).body;
    assert.equal(cart.recipeGroups[0].id, recipe);
    assert.equal(cart.items[0].basketGroupId, recipe);
  } finally {
    await desk.close();
  }
});

test("pasted list lines", () => {
  assert.deepEqual(parseListLine("2 havermelk"), { count: 2, query: "havermelk" });
  assert.deepEqual(parseListLine("3x tomatenblokjes"), { count: 3, query: "tomatenblokjes" });
  assert.deepEqual(parseListLine("3 × eieren"), { count: 3, query: "eieren" });
  assert.deepEqual(parseListLine("- tofu"), { count: 1, query: "tofu" });
  assert.deepEqual(parseListLine("• 2 bananen"), { count: 2, query: "bananen" });
  assert.deepEqual(parseListLine("500g kaas"), { count: 1, query: "500g kaas" });
  assert.deepEqual(parseListLine("0 appels"), { count: 1, query: "0 appels" });
  assert.equal(parseListLine("   "), null);
});

const ingredient = (over: Partial<RecipeIngredient>): RecipeIngredient => ({
  id: "s1",
  ingredientId: null,
  name: "x",
  imageId: null,
  displayPrice: 200,
  unitQuantity: "1",
  maxCount: 99,
  quantity: 1,
  isCondiment: false,
  nutritionRows: [],
  recipeQuantityText: null,
  recipePackageSize: null,
  originalPrice: null,
  priceRanges: null,
  ...over,
});

test("recipe prices follow picnic-web's recipe page", () => {
  assert.equal(packs(ingredient({ quantity: 1 }), 4, 2), 2);
  assert.equal(packs(ingredient({ quantity: 1 }), 3, 2), 2, "whole packs, rounded up");
  assert.equal(packs(ingredient({ quantity: 1 }), 1, 4), 1, "at least one");
  assert.deepEqual(packsPrice(ingredient({ priceRanges: [{ quantity: 2, pricePerUnit: 150 }] }), 2), { total: 300, was: 400 });
  assert.deepEqual(packsPrice(ingredient({ originalPrice: 250 }), 1), { total: 200, was: 250 });
  const recipe = {
    portions: 2,
    ingredients: [ingredient({ displayPrice: 300 }), ingredient({ displayPrice: 999, isCondiment: true })],
  };
  assert.deepEqual(recipePrice(recipe), { total: 300, perServing: 150, portions: 2 });
});

test("only real pictures are passed on", () => {
  assert.equal(pictureType(Buffer.from("<svg onload=alert(1)>")), null);
  assert.equal(pictureType(Buffer.from("<html>")), null);
  assert.equal(pictureType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(pictureType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")])), "image/webp");
});

test("pictures: what worked is tried first next time, and a missing one is not asked again for a while", async () => {
  const asked: string[] = [];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4/+IOAAVNAqRW9JQaAAAAAElFTkSuQmCC", "base64");
  let now = 0;
  const pictures = new Pictures(
    async (url) => {
      asked.push(String(url).split("/").pop()!);
      if (String(url).includes("missing")) return new Response("", { status: 404 });
      return String(url).endsWith("large.png") ? new Response(png) : new Response("", { status: 403 });
    },
    () => now,
    async () => {}
  );
  const first = await pictures.load("abcdefgh1", "product", "NL");
  assert.equal(first.picture?.variant, "large.png");
  asked.length = 0;
  await pictures.load("abcdefgh2", "product", "NL");
  assert.equal(asked[0], "large.png", "the variant that worked goes first");
  asked.length = 0;
  assert.equal((await pictures.load("missing01", "product", "NL")).picture, null);
  const tries = asked.length;
  await pictures.load("missing01", "product", "NL");
  assert.equal(asked.length, tries, "not asked again straight away");
  now += 11 * 60 * 1000;
  await pictures.load("missing01", "product", "NL");
  assert.ok(asked.length > tries, "asked again later");
  assert.equal(pictures.failures.at(-1)?.id, "missing01");
});
