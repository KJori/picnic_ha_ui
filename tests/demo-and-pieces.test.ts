/**
 * The demo shop (which the browser tests run against), and small pieces with
 * rules of their own.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4/+IOAAVNAqRW9JQaAAAAAElFTkSuQmCC", "base64");

/** A stand-in for Picnic's image server: `answer` decides per address. */
function imageServer(answer: (url: string) => Response | Promise<Response>) {
  const asked: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    asked.push(url.split("/static/images/")[1] ?? url);
    return answer(url);
  }) as typeof fetch;
  return { asked, fetchImpl };
}

test("pictures: what worked is tried first next time, and a missing one is not asked again for a while", async () => {
  let now = 0;
  const server = imageServer((url) =>
    url.includes("missing")
      ? new Response("", { status: 404 })
      : url.endsWith("large.png")
        ? new Response(PNG)
        : new Response("", { status: 403 })
  );
  const pictures = new Pictures({ fetch: server.fetchImpl, now: () => now, pause: async () => {} });
  const first = await pictures.load("abcdefgh1", "product", "NL");
  assert.equal(first.picture?.variant, "large.png");
  server.asked.length = 0;
  await pictures.load("abcdefgh2", "product", "NL");
  assert.equal(server.asked[0], "abcdefgh2/large.png", "the variant that worked goes first");
  server.asked.length = 0;
  assert.equal((await pictures.load("missing01", "product", "NL")).picture, null);
  const tries = server.asked.length;
  await pictures.load("missing01", "product", "NL");
  assert.equal(server.asked.length, tries, "not asked again straight away");
  now += 11 * 60 * 1000;
  await pictures.load("missing01", "product", "NL");
  assert.ok(server.asked.length > tries, "asked again later");
  assert.equal(pictures.failures.at(-1)?.id, "missing01");
});

test("pictures are kept on disk: asked from Picnic once, still there after a restart and when Picnic is down", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pictures-"));
  let picnicUp = true;
  const server = imageServer(() => (picnicUp ? new Response(PNG) : Promise.reject(new TypeError("fetch failed"))));
  const first = new Pictures({ dir, fetch: server.fetchImpl, pause: async () => {} });
  const loaded = await first.load("abcdefgh1", "product", "NL");
  assert.equal(loaded.from, "picnic");
  assert.deepEqual(loaded.picture?.data, PNG);
  assert.equal((await first.load("abcdefgh1", "product", "NL")).from, "disk");
  assert.equal(server.asked.length, 1, "asked once");
  assert.deepEqual(readdirSync(join(dir, "NL", "product")), ["abcdefgh1.png"]);

  picnicUp = false;
  const restarted = new Pictures({ dir, fetch: server.fetchImpl, pause: async () => {} });
  assert.deepEqual(restarted.stored.count, 1);
  const again = await restarted.load("abcdefgh1", "product", "NL");
  assert.equal(again.from, "disk");
  assert.deepEqual(again.picture?.data, PNG);
  assert.equal(again.picture?.type, "image/png");
  assert.equal(server.asked.length, 1, "Picnic not asked after the restart");
  assert.equal((await restarted.load("abcdefgh2", "product", "NL")).picture, null, "a new one needs Picnic");
});

test("pictures: the same picture asked by many cells at once is fetched once, and at most six go to Picnic together", async () => {
  let open = 0;
  let most = 0;
  const server = imageServer(async () => {
    open++;
    most = Math.max(most, open);
    await new Promise((r) => setTimeout(r, 5));
    open--;
    return new Response(PNG);
  });
  const pictures = new Pictures({ dir: mkdtempSync(join(tmpdir(), "pictures-")), fetch: server.fetchImpl });
  const same = await Promise.all(Array.from({ length: 10 }, () => pictures.load("samesame1", "product", "NL")));
  assert.ok(same.every((r) => r.picture));
  assert.equal(server.asked.length, 1);
  await Promise.all(Array.from({ length: 30 }, (_, i) => pictures.load(`different${i}`, "product", "NL")));
  assert.ok(most <= 6, `at most six at once, saw ${most}`);
  assert.equal(pictures.stored.count, 31);
});

test("pictures: the folder keeps to its size, dropping what was used longest ago", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pictures-"));
  const big = Buffer.concat([PNG, Buffer.alloc(1000)]); // still starts like a png
  let now = 1_000_000;
  const server = imageServer(() => new Response(big));
  const pictures = new Pictures({ dir, maxBytes: big.length * 3, fetch: server.fetchImpl, now: () => now });
  for (const id of ["picture01", "picture02", "picture03"]) {
    now += 1000;
    await pictures.load(id, "product", "NL");
  }
  now += 1000;
  await pictures.load("picture01", "product", "NL"); // used again: now the most recent
  now += 1000;
  await pictures.load("picture04", "product", "NL");
  const kept = readdirSync(join(dir, "NL", "product")).sort();
  assert.ok(!kept.includes("picture02.png"), "the one used longest ago went");
  assert.ok(kept.includes("picture01.png") && kept.includes("picture04.png"));
  assert.ok(pictures.stored.bytes <= big.length * 3);
});

test("pictures: a damaged or removed file is fetched again, leftovers of a cut-off write are cleared", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pictures-"));
  mkdirSync(join(dir, "NL", "product"), { recursive: true });
  writeFileSync(join(dir, "NL", "product", "damaged01.png"), "<svg onload=alert(1)>");
  writeFileSync(join(dir, "NL", "product", "halfway01.png.1.abc.tmp"), "x");
  const server = imageServer(() => new Response(PNG));
  const pictures = new Pictures({ dir, fetch: server.fetchImpl });
  const damaged = await pictures.load("damaged01", "product", "NL");
  assert.equal(damaged.from, "picnic");
  assert.deepEqual(damaged.picture?.data, PNG);
  await pictures.load("removed01", "product", "NL");
  rmSync(join(dir, "NL", "product", "removed01.png"));
  assert.equal((await pictures.load("removed01", "product", "NL")).from, "picnic");
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!readdirSync(join(dir, "NL", "product")).some((name) => name.endsWith(".tmp")));
});

test("pictures: a folder that cannot be written to still serves pictures", async () => {
  const blocked = join(mkdtempSync(join(tmpdir(), "pictures-")), "file");
  writeFileSync(blocked, "not a folder");
  const server = imageServer(() => new Response(PNG));
  const errors: unknown[] = [];
  const log = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    const pictures = new Pictures({ dir: blocked, fetch: server.fetchImpl });
    assert.ok((await pictures.load("abcdefgh1", "product", "NL")).picture);
    assert.ok((await pictures.load("abcdefgh2", "product", "NL")).picture);
  } finally {
    console.error = log;
  }
  assert.ok(errors.length >= 1 && errors.length <= 2, "said once on start and once for writing, not per picture");
});
