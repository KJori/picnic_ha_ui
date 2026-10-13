/**
 * The page's basket: quick to click, honest about what Picnic has.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { CartData, CartItem } from "@/lib/core/types";

import { CartModel } from "../src/ui/state/cart";
import type { Result } from "../src/ui/lib/api";

const item = (productId: string, quantity: number): CartItem => ({
  id: `line-${productId}`,
  productId,
  name: productId,
  unitQuantity: "1",
  imageId: "",
  displayPrice: 100 * quantity,
  originalPrice: null,
  quantity,
  maxCount: 99,
  badges: [],
  isUnavailable: false,
  unavailableExplanation: null,
  replacements: [],
  basketGroupId: null,
});

const cartOf = (lines: Record<string, number>): CartData => ({
  items: Object.entries(lines).map(([id, q]) => item(id, q)),
  totalPrice: Object.values(lines).reduce((n, q) => n + q * 100, 0),
  totalCount: Object.values(lines).reduce((n, q) => n + q, 0),
  totalDiscount: 0,
  depositTotal: 0,
  depositBreakdown: [],
  membershipSavings: 0,
  promoSavings: 0,
  fees: [],
  minimumOrderValue: null,
  suggestions: [],
  selectedSlot: null,
  deliveryBannerText: "",
  recipeGroups: [],
});

/** A fake Picnic basket whose answers are released by the test. */
function fakeServer(initial: Record<string, number> = {}) {
  const state: Record<string, number> = { ...initial };
  const sent: { productId: string; action: string; count: number }[] = [];
  const waiting: { release: (fail?: boolean) => void }[] = [];
  const send = (productId: string, action: "add" | "remove", count: number) =>
    new Promise<Result<CartData>>((resolve) => {
      sent.push({ productId, action, count });
      waiting.push({
        release: (fail = false) => {
          if (fail) return resolve({ ok: false, status: 502, error: "Failed to update cart." });
          state[productId] = Math.max(0, (state[productId] ?? 0) + (action === "add" ? count : -count));
          if (!state[productId]) delete state[productId];
          resolve({ ok: true, status: 200, data: cartOf(state) });
        },
      });
    });
  let loads = 0;
  const load = async (): Promise<Result<CartData>> => {
    loads += 1;
    return { ok: true, status: 200, data: cartOf(state) };
  };
  return { state, sent, waiting, send, load, loads: () => loads };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test("clicks show at once, and clicks on one product while a change is on its way go as one request", async () => {
  const server = fakeServer();
  const cart = new CartModel(server.send, server.load);
  await cart.refresh();
  cart.add("s1");
  cart.add("s1");
  cart.add("s1");
  assert.equal(cart.quantity("s1"), 3);
  assert.deepEqual(server.sent, [{ productId: "s1", action: "add", count: 1 }]);
  server.waiting.shift()!.release();
  await settle();
  assert.deepEqual(server.sent[1], { productId: "s1", action: "add", count: 2 });
  assert.equal(cart.quantity("s1"), 3);
  server.waiting.shift()!.release();
  await settle();
  assert.equal(cart.quantity("s1"), 3);
  assert.equal(cart.busy, false);
  assert.equal(server.state.s1, 3);
});

test("an add and a remove on their way cancel out without a request", async () => {
  const server = fakeServer({ s1: 1 });
  const cart = new CartModel(server.send, server.load);
  await cart.refresh();
  cart.add("s1"); // sent
  cart.add("s1"); // queued +1
  cart.remove("s1"); // queued 0
  server.waiting.shift()!.release();
  await settle();
  assert.equal(server.sent.length, 1);
  assert.equal(cart.quantity("s1"), 2);
});

test("an older answer does not overwrite a newer one", async () => {
  const server = fakeServer();
  const cart = new CartModel(server.send, server.load);
  await cart.refresh();
  cart.add("a");
  cart.add("b");
  const [first, second] = server.waiting.splice(0);
  second.release(); // b's answer (knows a? no: a not applied yet on the server)
  await settle();
  // Release a's request: the server applies it now, but its answer is the older request.
  first.release();
  await settle();
  await settle();
  // An answer was skipped, so the basket is fetched again and shows both.
  assert.equal(cart.quantity("a"), 1);
  assert.equal(cart.quantity("b"), 1);
  assert.ok(server.loads() >= 2);
});

test("a failed change is undone, reported and followed by a fresh look at the basket", async () => {
  const server = fakeServer({ s1: 2 });
  const cart = new CartModel(server.send, server.load);
  const errors: string[] = [];
  cart.onError = (m) => errors.push(m);
  await cart.refresh();
  cart.add("s1");
  cart.add("s1"); // queued behind the first
  assert.equal(cart.quantity("s1"), 4);
  server.waiting.shift()!.release(true);
  await settle();
  await settle();
  assert.deepEqual(errors, ["Failed to update cart."]);
  assert.equal(cart.quantity("s1"), 2, "both clicks are undone: the second built on the first");
  assert.equal(server.sent.length, 1);
  assert.equal(server.loads(), 2);
});

test("limits: never below zero, never above the maximum", async () => {
  const server = fakeServer({ s1: 1 });
  const cart = new CartModel(server.send, server.load);
  await cart.refresh();
  cart.remove("s1");
  cart.remove("s1");
  assert.equal(cart.quantity("s1"), 0);
  assert.equal(server.sent.length, 1);
  server.waiting.shift()!.release();
  await settle();
  cart.add("s2", 2, 5);
  assert.equal(cart.quantity("s2"), 2);
  assert.deepEqual(server.sent.at(-1), { productId: "s2", action: "add", count: 2 });
  cart.set("s2", 1, 2);
  assert.equal(cart.quantity("s2"), 1);
});

test("a product on two lines counts once per line", async () => {
  const server = fakeServer();
  const cart = new CartModel(server.send, async () => ({
    ok: true,
    status: 200,
    data: { ...cartOf({}), items: [item("s1", 2), { ...item("s1", 1), id: "line-2", basketGroupId: "r1" }] },
  }));
  await cart.refresh();
  assert.equal(cart.quantity("s1"), 3);
});

test("a refresh started before a change does not undo that change", async () => {
  let release!: () => void;
  const server = fakeServer({ s1: 1 });
  const slowLoad = () =>
    new Promise<Result<CartData>>((resolve) => {
      release = () => resolve({ ok: true, status: 200, data: cartOf({ s1: 1 }) });
    });
  const model = new CartModel(server.send, slowLoad);
  model.accept(cartOf({ s1: 1 }));
  const refreshing = model.refresh();
  model.add("s1");
  release();
  await refreshing;
  assert.equal(model.quantity("s1"), 2);
});
