/**
 * Picnic changes its answers without notice. Whatever it sends (nothing,
 * the wrong shape, an HTML page, an error, or no answer at all), every route
 * of the app must answer in time, with JSON the page can read, without
 * crashing, and keep working afterwards.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { installFetchTimeout } from "../src/server/fetch-timeout";
import { VENDORED_ROUTES } from "../src/server/routes.generated";
import { FAKE_SAFE_FETCH, FakePicnic, json, runDesk, signIn, type Running } from "./helpers";

/** Answers Picnic might give one day, each for every request. */
const GARBLED: [string, () => Response][] = [
  ["an empty object", () => json({})],
  ["an empty list", () => json([])],
  ["null", () => json(null)],
  ["the wrong types everywhere", () =>
    json({ items: "x", total_count: "many", deliveries: 5, products: {}, children: "x", id: 7, slots: null, sections: [1, 2] })],
  ["an HTML page", () => new Response("<!doctype html><title>Maintenance</title>", { headers: { "content-type": "text/html" } })],
  ["an empty body", () => new Response("", { status: 200 })],
  ["an RSC page of nonsense", () => new Response('0:"$garbage"\n1:[[[\n', { headers: { "content-type": "text/x-component" } })],
  ["a server error", () => new Response("<html>502 Bad Gateway</html>", { status: 502 })],
  ["an error in Picnic's shape", () => json({ error: { code: "SOMETHING_NEW", message: "Er ging iets mis" } }, { status: 400 })],
];

/** A body that has every field any route reads, so the routes get past their own checks. */
const BODY = {
  productId: "s1",
  action: "add",
  count: 1,
  orderId: "o1",
  transactionId: "t1",
  slotId: "slot1",
  rating: 8,
  saved: true,
  resolveKey: "k",
  candidateIds: ["a"],
  fixedIds: [],
  recipeIds: ["a"],
  slots: 1,
  people: 2,
  portions: 2,
  ingredientId: "i1",
  selectedIds: ["s1"],
};

const filled = (path: string) => path.replace(/\[[^\]]+\]/g, "x1");

/** Every route the page can call, with a plausible request. */
const CALLS: { method: string; path: string }[] = [
  ...VENDORED_ROUTES.filter((r) => !r.path.startsWith("auth/")).flatMap((r) =>
    r.methods.map((method) => ({
      method,
      path:
        filled(r.path) +
        ({
          search: "?q=melk",
          suggestions: "?q=me",
          "rsc-pages": "?pageId=category-tree-root",
          "pages/products": "?pageId=x",
          "cookbook/search": "?q=pasta",
          "cart/checkout/status": "?transactionId=t1",
        }[r.path] ?? ""),
    }))
  ),
  { method: "GET", path: "desk/history?refresh=1" },
  { method: "GET", path: "desk/selfcheck" },
  { method: "GET", path: "desk/recipe-price?id=0123456789abcdef01234567" },
  { method: "GET", path: "desk/raw?page=search-page-results" },
  { method: "GET", path: `desk/image?id=${"f".repeat(64)}` },
];

let picnic: FakePicnic;
let desk: Running;
let answer: () => Response = () => json({});
const unexpected: unknown[] = [];
const onUnhandled = (reason: unknown) => unexpected.push(reason);

before(async () => {
  picnic = new FakePicnic().install();
  installFetchTimeout(400); // as in the app, but short: one case never answers
  desk = await runDesk();
  await signIn(desk, picnic);
  for (const method of ["GET", "POST", "PUT", "DELETE"]) picnic.on(method, /.*/, () => answer());
  process.on("unhandledRejection", onUnhandled);
});
after(async () => {
  process.off("unhandledRejection", onUnhandled);
  picnic.restore();
  await desk.close();
});

async function call(method: string, path: string) {
  const started = Date.now();
  const response = await FAKE_SAFE_FETCH(`${desk.base}/api/${path}`, {
    method,
    headers: method === "GET" ? {} : { "x-desk-base": desk.base, "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(BODY),
    signal: AbortSignal.timeout(8000),
  });
  const text = await response.text();
  return { status: response.status, type: response.headers.get("content-type") ?? "", text, ms: Date.now() - started };
}

describe("whatever Picnic sends, every route answers sensibly", () => {
  for (const [what, make] of GARBLED) {
    test(`Picnic sends ${what}`, async () => {
      answer = make;
      const problems: string[] = [];
      const asked = picnic.seen.length;
      const statuses = new Map<number, number>();
      for (const { method, path } of CALLS) {
        const result = await call(method, path);
        statuses.set(result.status, (statuses.get(result.status) ?? 0) + 1);
        const where = `${method} /api/${path}`;
        // A 500 is the app's own crash; Picnic's trouble shows as 4xx or 502.
        if (result.status === 500) problems.push(`${where}: 500 ${result.text.slice(0, 120)}`);
        if (path.startsWith("desk/image") || path.startsWith("desk/raw")) continue; // a picture or a download
        if (!result.type.includes("json")) problems.push(`${where}: ${result.status} as ${result.type || "no type"}`);
        else {
          try {
            JSON.parse(result.text);
          } catch {
            problems.push(`${where}: unreadable JSON`);
          }
        }
      }
      if (process.env.FUZZ_REPORT) console.log(what, Object.fromEntries(statuses), "Picnic asked", picnic.seen.length - asked);
      // Every vendored route reached Picnic: the routes' own checks did not stop them first.
      assert.ok(picnic.seen.length - asked >= CALLS.length - 5, `Picnic asked ${picnic.seen.length - asked} times for ${CALLS.length} calls`);
      assert.deepEqual(problems, []);
      // Still signed in, still working.
      answer = () => json({});
      assert.equal((await call("GET", "desk/state")).status, 200);
      assert.equal(JSON.parse((await call("GET", "desk/state")).text).signedIn, true, "a garbled answer is no sign-out");
    });
  }

  test("Picnic does not answer at all: every route gives up within the time limit", async () => {
    answer = () => new Response(new ReadableStream({ start() {} }), { status: 200 }); // headers, then nothing
    picnic.on("GET", /.*/, () => new Promise<Response>(() => {})); // not even headers, for GETs
    const slow: string[] = [];
    // A sample: every vendored GET waits on Picnic at least once.
    for (const { method, path } of CALLS.filter((c) => c.method === "GET" && !c.path.startsWith("desk/selfcheck"))) {
      const result = await call(method, path);
      if (result.status === 500) slow.push(`${method} ${path}: 500`);
      if (result.ms > 6000) slow.push(`${method} ${path}: ${result.ms} ms`);
    }
    assert.deepEqual(slow, []);
  });

  test("nothing was left unhandled", () => {
    assert.deepEqual(unexpected.map(String), []);
  });
});
