/**
 * The payment in progress, kept by the server (src/server/payments.ts):
 * remembered from the moment it starts, also over a restart; confirmed by the
 * server when no page does it; never confirmed twice; and an order Picnic
 * took while its answer got lost counts as placed.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Desk } from "../src/server/app";
import { PAYMENT_WATCH_MS } from "../src/server/payments";
import { FakePicnic, json, runDesk, signIn, type Running } from "./helpers";

let picnic: FakePicnic;
let desk: Running;
let clock: number;

const ORDER = "order-1";
const TX = "tx-1";

/** A current delivery with `orders` orders in it, as POST /deliveries/summary sends it. */
const delivery = (id: string, orders: number) => ({
  delivery_id: id,
  status: "CURRENT",
  creation_time: "2026-10-17T10:00:00.000+02:00",
  slot: { window_start: "2026-10-18T12:00:00.000+02:00", window_end: "2026-10-18T14:00:00.000+02:00" },
  orders: Array.from({ length: orders }, (_, i) => ({ id: `${id}-o${i}`, total_price: 1000 })),
});

let checkoutStatus = "PENDING";
let deliveries: unknown[] = [];

beforeEach(async () => {
  clock = Date.parse("2026-10-17T10:00:00Z");
  checkoutStatus = "PENDING";
  deliveries = [delivery("d-old", 1)];
  picnic = new FakePicnic().install();
  desk = await runDesk({ now: () => clock });
  await signIn(desk, picnic);
  picnic.on("POST", "/cart/checkout/initiate_payment", json({ payment_id: "p1", transaction_id: TX, action: { redirect_url: "https://bank.example/pay" } }));
  picnic.on("GET", `/cart/checkout/${TX}/status`, () => json({ checkout_status: checkoutStatus }));
  picnic.on("POST", `/cart/checkout/order/${ORDER}/confirm`, json({ order_id: ORDER, delivery_slot: {}, analytics: null }));
  picnic.on("POST", "/cart/checkout/cancel", json({}));
  picnic.on("POST", "/deliveries/summary", () => json(deliveries));
});
afterEach(async () => {
  picnic.restore();
  await desk.close();
});

const confirms = () => picnic.seen.filter((s) => s.url.pathname.endsWith(`/cart/checkout/order/${ORDER}/confirm`)).length;
const paymentFile = () => join(desk.dataDir, "payment.json");

/** Start paying, and wait until the server has noted Picnic's current deliveries. */
async function startPaying() {
  const started = await desk.post("/api/cart/checkout/initiate", { orderId: ORDER });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  for (let i = 0; i < 50 && JSON.parse(readFileSync(paymentFile(), "utf8")).before === null; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.notEqual(JSON.parse(readFileSync(paymentFile(), "utf8")).before, null);
}

const state = async () => (await desk.get("/api/desk/state")).body;

describe("a payment kept by the server", () => {
  test("is noted when it starts, shown to every page, and kept over a restart", async () => {
    assert.equal((await state()).payment, null);
    await startPaying();
    assert.deepEqual((await state()).payment, { orderId: ORDER, transactionId: TX, startedAt: clock, gaveUp: false });
    const again = new Desk({ ...desk.desk.options, watchPayments: false });
    assert.equal(again.payments.open?.transactionId, TX);
  });

  test("is confirmed by the server once Picnic says it is paid, when no page does it", async () => {
    await startPaying();
    await desk.desk.payments.tick();
    assert.equal(confirms(), 0, "not paid yet: nothing to confirm");
    assert.equal((await state()).payment?.transactionId, TX);

    checkoutStatus = "FINISHED";
    await desk.desk.payments.tick();
    assert.equal(confirms(), 1);
    assert.equal((await state()).payment, null);
    assert.equal(existsSync(paymentFile()), false);
  });

  test("is confirmed once, however many tabs and the server ask at the same time", async () => {
    await startPaying();
    checkoutStatus = "FINISHED";
    const body = { orderId: ORDER, transactionId: TX };
    const answers = await Promise.all([
      desk.post("/api/cart/checkout/confirm", body),
      desk.post("/api/cart/checkout/confirm", body),
      desk.desk.payments.tick(),
    ]);
    assert.equal(confirms(), 1);
    assert.deepEqual(answers.slice(0, 2).map((a) => a?.status), [200, 200]);
    // A tab that asks later gets the same answer, without asking Picnic again.
    assert.equal((await desk.post("/api/cart/checkout/confirm", body)).body.success, true);
    assert.equal(confirms(), 1);
  });

  test("an order Picnic took while its answer got lost counts as placed", async () => {
    await startPaying();
    checkoutStatus = "FINISHED";
    picnic.on("POST", `/cart/checkout/order/${ORDER}/confirm`, () => {
      deliveries = [delivery("d-old", 2)]; // Picnic added the order to the delivery already booked
      return json({ error: { message: "upstream timeout" } }, { status: 504 });
    });
    const confirmed = await desk.post("/api/cart/checkout/confirm", { orderId: ORDER, transactionId: TX });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.deepEqual(confirmed.body, { success: true, orderId: ORDER });
    assert.equal((await state()).payment, null);
  });

  test("a confirmation that failed, with no new order at Picnic, stays an error and the payment stays open", async () => {
    await startPaying();
    checkoutStatus = "FINISHED";
    picnic.on("POST", `/cart/checkout/order/${ORDER}/confirm`, json({ error: { message: "busy" } }, { status: 503 }));
    const confirmed = await desk.post("/api/cart/checkout/confirm", { orderId: ORDER, transactionId: TX });
    assert.equal(confirmed.status, 502);
    assert.equal((await state()).payment?.transactionId, TX);
    // Next time it works.
    picnic.on("POST", `/cart/checkout/order/${ORDER}/confirm`, json({ order_id: ORDER, delivery_slot: {}, analytics: null }));
    await desk.desk.payments.tick();
    assert.equal((await state()).payment, null);
  });

  test("a payment that is not finished is not taken for a placed order", async () => {
    await startPaying();
    deliveries = [delivery("d-old", 1), delivery("d-other", 1)]; // a new delivery, but the payment is not done
    const confirmed = await desk.post("/api/cart/checkout/confirm", { orderId: ORDER, transactionId: TX });
    assert.equal(confirmed.status, 409);
    assert.equal(confirms(), 0);
    assert.equal((await state()).payment?.transactionId, TX);
  });

  test("is forgotten when cancelled, when Picnic says it failed, and on signing out", async () => {
    await startPaying();
    assert.equal((await desk.post("/api/cart/checkout/cancel", { transactionId: TX })).status, 200);
    assert.equal((await state()).payment, null);

    await startPaying();
    checkoutStatus = "CANCELLED";
    await desk.desk.payments.tick();
    assert.equal((await state()).payment, null);
    assert.equal(confirms(), 0);

    await startPaying();
    await desk.post("/api/auth/logout", {});
    assert.equal(existsSync(paymentFile()), false);
    assert.equal(desk.desk.payments.open, null);
  });

  test("after two hours without an answer, the page is told to look at the orders, until it says it did", async () => {
    await startPaying();
    assert.equal((await desk.post("/api/desk/payment", undefined, "DELETE")).body.payment.gaveUp, false, "still watched: kept");
    clock += PAYMENT_WATCH_MS + 1;
    await desk.desk.payments.tick();
    assert.equal((await state()).payment.gaveUp, true);
    const asked = picnic.seen.length;
    await desk.desk.payments.tick();
    assert.equal(picnic.seen.length, asked, "no more asking Picnic");
    assert.equal((await desk.post("/api/desk/payment", undefined, "DELETE")).body.payment, null);
    assert.equal((await state()).payment, null);
  });
});

test("the demo shop's payment is confirmed by the server too", async () => {
  const demo = await runDesk({ demo: (await import("../src/server/demo/shop")).demoShop(), now: () => clock });
  try {
    await demo.post("/api/auth/login-credentials", { email: "a@b.c", password: "2fa" });
    assert.equal((await demo.post("/api/auth/verify-2fa", { code: "123456" })).body.success, true);
    const started = await demo.post("/api/cart/checkout/initiate", { orderId: "demo-order" });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal(demo.desk.payments.open?.orderId, "demo-order");
    // The demo's payment is done after it was asked about twice.
    for (let i = 0; i < 3 && demo.desk.payments.open; i++) await demo.desk.payments.tick();
    assert.equal(demo.desk.payments.open, null);
  } finally {
    await demo.close();
  }
});
