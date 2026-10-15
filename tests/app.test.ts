/**
 * Picnic Desk's server around picnic-web's real routes, with Picnic faked at
 * the fetch level: what reaches Picnic, what reaches the browser, and what
 * is kept on disk.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, afterEach, beforeEach, describe, test } from "node:test";

import { fromGateway, pageBase } from "../src/server/app";
import { installFetchTimeout } from "../src/server/fetch-timeout";
import { FAKE_SAFE_FETCH, FakePicnic, fixture, json, runDesk, signIn, type Running } from "./helpers";

let picnic: FakePicnic;
let desk: Running;

beforeEach(async () => {
  picnic = new FakePicnic().install();
  desk = await runDesk();
});
afterEach(async () => {
  picnic.restore();
  await desk.close();
});

describe("the door", () => {
  test("only Home Assistant's ingress gateway counts as the gateway", () => {
    assert.equal(fromGateway("172.30.32.2"), true);
    assert.equal(fromGateway("::ffff:172.30.32.2"), true);
    for (const other of ["127.0.0.1", "172.30.32.1", "172.30.32.20", "::1", undefined]) assert.equal(fromGateway(other), false);
  });

  test("with ingress only, everyone else is turned away, forwarded headers or not", async () => {
    const guarded = await runDesk({ ingressOnly: true });
    try {
      for (const path of ["/", "/api/desk/state", "/api/cart"]) {
        assert.equal((await guarded.get(path)).status, 403, path);
      }
      assert.equal((await guarded.get("/api/desk/state", { "x-forwarded-for": "172.30.32.2" })).status, 403);
    } finally {
      await guarded.close();
    }
  });

  test("the page comes with a strict content policy, and files stay inside the folder", async () => {
    const page = await desk.get("/");
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'self'.*frame-ancestors 'self'/);
    assert.match(page.headers.get("content-security-policy") ?? "", /img-src 'self' data:;/, "no pictures from outside");
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.equal(page.headers.get("referrer-policy"), "no-referrer");
    for (const path of ["/..%2Fpackage.json", "/%2e%2e/%2e%2e/etc/passwd", "/app.css%00.html", "/nope.js"]) {
      assert.equal((await desk.get(path)).status, 404, path);
    }
    assert.equal((await desk.post("/", {})).status, 405);
  });

  test("the page's files carry a tag, so an unchanged file is not sent again", async () => {
    const first = await desk.get("/app.css");
    const etag = first.headers.get("etag");
    assert.ok(etag);
    const again = await FAKE_SAFE_FETCH(`${desk.base}/app.css`, { headers: { "if-none-match": etag } });
    assert.equal(again.status, 304);
    assert.equal((await again.text()).length, 0);
    const changed = await FAKE_SAFE_FETCH(`${desk.base}/app.css`, { headers: { "if-none-match": '"something-else"' } });
    assert.equal(changed.status, 200);
    const head = await FAKE_SAFE_FETCH(`${desk.base}/app.css`, { method: "HEAD" });
    assert.equal(head.headers.get("content-length"), String(first.body.length));
  });

  test("the payment page's way back leads into the page", async () => {
    const response = await FAKE_SAFE_FETCH(`${desk.base}/checkout/return`, { redirect: "manual" });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "../#/checkout/return");
  });

  test("changes from another site are refused", async () => {
    // What a form or a plain fetch on another site can send: no custom header.
    for (const [path, body] of [
      ["/api/cart", '{"productId":"s1","action":"add","count":1}'],
      ["/api/cart/checkout/start", "{}"],
      ["/api/auth/logout", ""],
    ]) {
      const response = await FAKE_SAFE_FETCH(`${desk.base}${path}`, { method: "POST", headers: { "content-type": "text/plain" }, body });
      assert.equal(response.status, 403, path);
    }
    assert.equal(picnic.seen.length, 0, "nothing reached Picnic");
  });

  test("an oversized request body is refused", async () => {
    const response = await desk.post("/api/cart", "x".repeat(1024 * 1024 + 10));
    assert.equal(response.status, 413);
  });

  test("the page's address is passed on only when it is a plain web address", () => {
    assert.equal(pageBase("https://ha.example/api/hassio_ingress/abc/"), "https://ha.example/api/hassio_ingress/abc");
    assert.equal(pageBase("http://192.168.1.2:8123/api/hassio_ingress/abc"), "http://192.168.1.2:8123/api/hassio_ingress/abc");
    for (const bad of ["javascript:alert(1)", "https://user:pw@x/", "https://x/?a=1", "not a url", ["https://x"], undefined]) {
      assert.equal(pageBase(bad as string), undefined, String(bad));
    }
  });
});

describe("signing in", () => {
  test("a token is checked with Picnic, kept on the server only, and used from then on", async () => {
    picnic.on("GET", /^\/suggest/, json([]));
    const login = await desk.post("/api/auth/login", { token: " secret-token ", countryCode: "DE" });
    assert.deepEqual(login.body, { success: true });
    assert.deepEqual(login.headers.getSetCookie(), [], "no cookie reaches the browser");
    assert.equal(picnic.last("/suggest")?.headers.get("x-picnic-auth"), "secret-token");
    assert.equal(picnic.last("/suggest")?.url.hostname, "storefront-prod.de.picnicinternational.com");

    const saved = JSON.parse(readFileSync(join(desk.dataDir, "auth.json"), "utf8"));
    assert.equal(saved.token, "secret-token");
    assert.equal(saved.country, "DE");
    assert.equal(statSync(join(desk.dataDir, "auth.json")).mode & 0o777, 0o600);

    const state = await desk.get("/api/desk/state");
    assert.equal(state.body.signedIn, true);
    assert.equal(state.body.country, "DE");
    assert.equal(JSON.stringify(state.body).includes("secret-token"), false);

    picnic.on("GET", "/cart", json(fixture("cart_de.json")));
    assert.equal((await desk.get("/api/cart")).status, 200);
    assert.equal(picnic.last("/cart")?.headers.get("x-picnic-auth"), "secret-token");
  });

  test("a token Picnic refuses is not kept", async () => {
    picnic.on("GET", /^\/suggest/, json({ error: { code: "AUTH_INVALID", message: "Unauthorized" } }, { status: 401 }));
    const login = await desk.post("/api/auth/login", { token: "bad" });
    assert.deepEqual(login.body, { success: false, error: "TOKEN_INVALID" });
    assert.equal((await desk.get("/api/desk/state")).body.signedIn, false);
    assert.throws(() => statSync(join(desk.dataDir, "auth.json")));
  });

  test("with a verification code: the half-finished token never reaches the browser", async () => {
    picnic.on(
      "POST",
      "/user/login",
      json({ second_factor_authentication_required: true, user_id: "u1" }, { headers: { "x-picnic-auth": "partial-123" } })
    );
    picnic.on("POST", "/user/2fa/generate", json(null));
    const step1 = await desk.post("/api/auth/login-credentials", { email: "a@b.nl", password: "pw" });
    assert.deepEqual(step1.body, { success: false, error: "2FA_REQUIRED" });
    assert.equal(JSON.stringify(step1.body).includes("partial-123"), false);
    // The password goes to Picnic as its MD5, as the app does; it is not written anywhere.
    const sent = JSON.parse(picnic.last("/user/login")!.body!);
    assert.equal(sent.key, "a@b.nl");
    assert.equal(sent.secret, createHash("md5").update("pw").digest("hex"));
    assert.equal(JSON.parse(picnic.last("/user/2fa/generate")!.body!).channel, "SMS");
    assert.equal((await desk.get("/api/desk/state")).body.awaitingCode, true);

    // Send the code again, by e-mail this time.
    assert.deepEqual((await desk.post("/api/desk/code", { channel: "EMAIL" })).body, { sent: "EMAIL" });
    assert.equal(JSON.parse(picnic.last("/user/2fa/generate")!.body!).channel, "EMAIL");
    assert.equal(picnic.last("/user/2fa/generate")!.headers.get("x-picnic-auth"), "partial-123");
    assert.equal((await desk.post("/api/desk/code", { channel: "CARRIER PIGEON" })).status, 400);

    picnic.on("POST", "/user/2fa/verify", (seen) =>
      JSON.parse(seen.body!).otp === "654321"
        ? json({}, { headers: { "x-picnic-auth": "full-456" } })
        : json({ error: { message: "Invalid code" } }, { status: 400 })
    );
    picnic.on("GET", /^\/suggest/, json([]));
    const wrong = await desk.post("/api/auth/verify-2fa", { code: "000000", partialToken: "forged" });
    assert.equal(wrong.body.success, false);
    assert.equal(picnic.last("/user/2fa/verify")!.headers.get("x-picnic-auth"), "partial-123", "the browser cannot pick the token");
    const right = await desk.post("/api/auth/verify-2fa", { code: "654321" });
    assert.deepEqual(right.body, { success: true });
    assert.equal(JSON.parse(readFileSync(join(desk.dataDir, "auth.json"), "utf8")).token, "full-456");
    assert.equal((await desk.get("/api/desk/state")).body.awaitingCode, false);
    assert.equal(readFileSync(join(desk.dataDir, "auth.json"), "utf8").includes("pw"), false);
  });

  test("resending a code without a sign-in in progress asks to start again", async () => {
    assert.equal((await desk.post("/api/desk/code", { channel: "SMS" })).status, 409);
  });

  test("signing out forgets the token and what belonged to the account", async () => {
    await signIn(desk, picnic);
    writeFileSync(join(desk.dataDir, "history.json"), JSON.stringify({ builtAt: new Date().toISOString(), deliveries: 1, items: [] }));
    const out = await desk.post("/api/auth/logout");
    assert.deepEqual(out.body, { success: true });
    assert.equal((await desk.get("/api/desk/state")).body.signedIn, false);
    assert.throws(() => statSync(join(desk.dataDir, "auth.json")));
    assert.throws(() => statSync(join(desk.dataDir, "history.json")));
    assert.equal((await desk.get("/api/cart")).status, 401);
  });

  test("what version 0.x kept is read: its session and its saved products", async () => {
    const old = await runDesk();
    try {
      writeFileSync(join(old.dataDir, "auth.json"), JSON.stringify({ token: "from-python" }));
      writeFileSync(
        join(old.dataDir, "saved.json"),
        JSON.stringify([{ id: "s1", name: "Tofu", unit: "375 g", image: "abc", price: 179, max: 99 }])
      );
      const upgraded = await runDesk({ dataDir: old.dataDir });
      try {
        assert.equal((await upgraded.get("/api/desk/state")).body.signedIn, true);
        picnic.on("GET", "/cart", json(fixture("cart_de.json")));
        await upgraded.get("/api/cart");
        assert.equal(picnic.last("/cart")?.headers.get("x-picnic-auth"), "from-python");
        assert.deepEqual((await upgraded.get("/api/desk/saved")).body.products, [
          { id: "s1", name: "Tofu", imageId: "abc", unitQuantity: "375 g", displayPrice: 179 },
        ]);
      } finally {
        await upgraded.close();
      }
    } finally {
      await old.close();
    }
  });

  test("the token survives a restart", async () => {
    await signIn(desk, picnic, "kept");
    const again = await runDesk({ dataDir: desk.dataDir });
    try {
      assert.equal((await again.get("/api/desk/state")).body.signedIn, true);
    } finally {
      await again.close(); // also removes the shared data folder; the first desk's close copes
    }
  });
});

describe("when Picnic says no", () => {
  beforeEach(async () => signIn(desk, picnic));

  test("an expired token shows as expired, and the next answer that works clears it", async () => {
    picnic.on("GET", "/cart", json({ error: { code: "AUTH_INVALID", message: "Unauthorized" } }, { status: 401 }));
    const cart = await desk.get("/api/cart");
    assert.equal(cart.status, 401);
    assert.equal(cart.body.code, "TOKEN_EXPIRED");
    const state = (await desk.get("/api/desk/state")).body;
    assert.deepEqual([state.signedIn, state.expired], [false, true]);
    picnic.on("GET", "/cart", json(fixture("cart_de.json")));
    assert.equal((await desk.get("/api/cart")).status, 200);
    assert.equal((await desk.get("/api/desk/state")).body.signedIn, true);
  });

  test("throttling by the edge (a 403 HTML page) is not mistaken for a signed-out session", async () => {
    picnic.on(
      "GET",
      "/cart",
      new Response("<html><body><h1>403 Forbidden</h1></body></html>", { status: 403, statusText: "Forbidden", headers: { "content-type": "text/html" } })
    );
    const cart = await desk.get("/api/cart");
    assert.equal(cart.status, 502);
    assert.equal((await desk.get("/api/desk/state")).body.signedIn, true);
  });

  test("a route that throws gives a 502, not a crash", async () => {
    picnic.on("GET", /^\/pages\/meals-page-root/, () => {
      throw new TypeError("boom");
    });
    const response = await desk.get("/api/debug-cookbook");
    assert.equal(response.status, 502);
    assert.equal((await desk.get("/api/desk/state")).status, 200);
  });

  test("unknown routes and methods", async () => {
    assert.equal((await desk.get("/api/nope")).status, 404);
    assert.equal((await desk.get("/api/user/referral")).status, 404);
    assert.equal((await desk.get("/api/wallet")).status, 404);
    const put = await desk.post("/api/cart", {}, "PUT");
    assert.equal(put.status, 405);
    assert.match(put.headers.get("allow") ?? "", /GET/);
    assert.equal((await desk.get("/api/desk/nope")).status, 404);
    assert.equal((await desk.post("/api/desk/state", {})).status, 405);
  });
});

describe("picnic-web's parsers on Picnic's real answers", () => {
  beforeEach(async () => signIn(desk, picnic));

  test("product page", async () => {
    picnic.on("GET", /^\/pages\/product-details-page-root\?id=s1018620/, json(fixture("product_details_page_nl.json")));
    const product = await desk.get("/api/product/s1018620");
    assert.equal(product.status, 200, JSON.stringify(product.body));
    assert.deepEqual(
      [product.body.id, product.body.name, product.body.brand, product.body.unitQuantity, product.body.displayPrice],
      ["s1018620", "Aromatico filterkoffie", "Picnic", "500 gram", 799]
    );
    assert.ok(Array.isArray(product.body.infoSections));
  });

  test("basket", async () => {
    picnic.on("GET", "/cart", json(fixture("cart_de.json")));
    const cart = await desk.get("/api/cart");
    assert.equal(cart.status, 200);
    for (const key of ["items", "totalPrice", "totalCount", "depositBreakdown", "fees", "selectedSlot", "deliveryBannerText", "recipeGroups"]) {
      assert.ok(key in cart.body, key);
    }
  });

  test("adding to the basket sends Picnic the product and count", async () => {
    picnic.on("POST", "/cart/add_product", json(fixture("cart_de.json")));
    const result = await desk.post("/api/cart", { productId: "s100", action: "add", count: 3 });
    assert.equal(result.status, 200);
    const sent = JSON.parse(picnic.last("/cart/add_product")!.body!);
    assert.equal(sent.product_id, "s100");
    assert.equal(sent.count, 3);
    assert.equal((await desk.post("/api/cart", { productId: "s100", action: "steal", count: 1 })).status, 400);
    assert.equal((await desk.post("/api/cart", "not json")).status, 400);
  });

  test("orders list and one order", async () => {
    picnic.on("POST", "/deliveries/summary", json(fixture("current_deliveries_de.json")));
    picnic.on("GET", "/deliveries/d0000000000", json(fixture("delivery_de.json")));
    const list = await desk.get("/api/deliveries");
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.deliveries));
    assert.equal(list.body.deliveries[0].id, "d0000000000");
    const one = await desk.get("/api/deliveries/d0000000000");
    assert.equal(one.status, 200);
    assert.equal(one.body.id, "d0000000000");
  });

  // This sample is older than picnic-web's search parser (Picnic has changed the
  // page since); it shows the route copes with a page it cannot read.
  test("search answers in picnic-web's shape", async () => {
    picnic.on("GET", /^\/pages\/search-page-results\?search_term=koffie/, json(fixture("search_page_nl.json")));
    const result = await desk.get("/api/search?q=koffie");
    assert.equal(result.status, 200);
    assert.equal(result.body.query, "koffie");
    assert.ok(Array.isArray(result.body.products) && Array.isArray(result.body.sections));
  });
});

describe("pictures", () => {
  test("tries the next variant when one is missing, and refuses non-pictures", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4/+IOAAVNAqRW9JQaAAAAAElFTkSuQmCC", "base64");
    const id = "a".repeat(64);
    picnic.on("GET", new RegExp(`/static/images/${id}/medium.png`), new Response("nope", { status: 404 }));
    picnic.on("GET", new RegExp(`/static/images/${id}/padded.webp`), new Response("<svg onload=alert(1)>", { status: 200 }));
    picnic.on("GET", new RegExp(`/static/images/${id}/small.png`), new Response(png, { status: 200 }));
    const picture = await FAKE_SAFE_FETCH(`${desk.base}/api/desk/image?id=${id}`);
    assert.equal(picture.status, 200);
    assert.equal(picture.headers.get("content-type"), "image/png");
    assert.equal(picture.headers.get("content-security-policy"), "default-src 'none'");
    assert.deepEqual(Buffer.from(await picture.arrayBuffer()), png);
    for (const bad of ["../../etc/passwd", "a/b/cccccccccc", "short", "x".repeat(200)]) {
      assert.equal((await FAKE_SAFE_FETCH(`${desk.base}/api/desk/image?id=${encodeURIComponent(bad)}`)).status, 404, bad);
    }
    assert.equal(picnic.seen.every((s) => s.url.hostname === "storefront-prod.nl.picnicinternational.com"), true);
  });

  test("when Picnic is busy, a picture's other variants are not tried, and it is asked again soon", async () => {
    const id = "c".repeat(64);
    picnic.on("GET", new RegExp(`/static/images/${id}/`), new Response("slow down", { status: 429 }));
    const before = picnic.seen.length;
    assert.equal((await FAKE_SAFE_FETCH(`${desk.base}/api/desk/image?id=${id}`)).status, 404);
    const asked = picnic.seen.slice(before).map((s) => s.url.pathname.split("/").pop());
    assert.deepEqual(asked, ["medium.png", "medium.png"], "one variant, asked twice, then stop");
  });

  test("a picture that is too large, or cut off halfway, is refused without trouble", async () => {
    const PNG_START = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const big = "d".repeat(64);
    picnic.on("GET", new RegExp(`/static/images/${big}/`), () =>
      new Response(Buffer.concat([PNG_START, Buffer.alloc(9 * 1024 * 1024)]), { status: 200 })
    );
    assert.equal((await FAKE_SAFE_FETCH(`${desk.base}/api/desk/image?id=${big}`)).status, 404);
    const cut = "e".repeat(64);
    picnic.on("GET", new RegExp(`/static/images/${cut}/`), () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
          controller.error(new Error("connection reset"));
        },
      });
      return new Response(body, { status: 200 });
    });
    const response = await FAKE_SAFE_FETCH(`${desk.base}/api/desk/image?id=${cut}`);
    assert.equal(response.status, 404);
  });

  test("a picture is fetched from Picnic once and then served from the app's folder", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4/+IOAAVNAqRW9JQaAAAAAElFTkSuQmCC", "base64");
    const id = "b".repeat(64);
    picnic.on("GET", new RegExp(`/static/images/${id}/medium.png`), new Response(png, { status: 200 }));
    const before = picnic.seen.length;
    for (let i = 0; i < 3; i++) {
      const picture = await FAKE_SAFE_FETCH(`${desk.base}/api/desk/image?id=${id}`);
      assert.equal(picture.status, 200);
      assert.deepEqual(Buffer.from(await picture.arrayBuffer()), png);
    }
    assert.equal(picnic.seen.length - before, 1, "Picnic asked once");
    assert.ok(existsSync(join(desk.dataDir, "picture-cache", "NL", "product", `${id}.png`)));
  });
});

describe("the desk's own routes", () => {
  beforeEach(async () => signIn(desk, picnic));

  test("starring products: checked, toggled, kept", async () => {
    const product = { id: "s1", name: "Tofu", imageId: "img", unitQuantity: "375 g", displayPrice: 179, extra: "dropped" };
    const on = await desk.post("/api/desk/saved", { product });
    assert.equal(on.body.saved, true);
    assert.deepEqual(on.body.products, [{ id: "s1", name: "Tofu", imageId: "img", unitQuantity: "375 g", displayPrice: 179 }]);
    const off = await desk.post("/api/desk/saved", { product });
    assert.deepEqual([off.body.saved, off.body.products], [false, []]);
    for (const bad of [{}, { product: { id: "s1" } }, { product: { ...product, displayPrice: "1" } }, { product: { ...product, name: "x".repeat(400) } }]) {
      assert.equal((await desk.post("/api/desk/saved", bad)).status, 400, JSON.stringify(bad));
    }
  });

  test("shortcuts: defaults per country, own list, back to defaults", async () => {
    const defaults = (await desk.get("/api/desk/shortcuts")).body.shortcuts;
    assert.equal(defaults[0].label, "Brood");
    const own = await desk.post("/api/desk/shortcuts", { shortcuts: [{ label: " Tofu ", query: "tofu" }] }, "PUT");
    assert.deepEqual(own.body.shortcuts, [{ label: "Tofu", query: "tofu" }]);
    assert.deepEqual((await desk.get("/api/desk/shortcuts")).body.shortcuts, [{ label: "Tofu", query: "tofu" }]);
    for (const bad of [{ shortcuts: "x" }, { shortcuts: [{ label: "", query: "x" }] }, { shortcuts: Array(30).fill({ label: "a", query: "b" }) }]) {
      assert.equal((await desk.post("/api/desk/shortcuts", bad, "PUT")).status, 400);
    }
    assert.deepEqual((await desk.post("/api/desk/shortcuts", { shortcuts: null }, "PUT")).body.shortcuts, defaults);
  });

  test("bought before: the last orders added up, most often bought first, cached", async () => {
    const delivery = (id: string, items: [string, number][]) => ({
      delivery_id: id,
      creation_time: "2026-07-14T22:36:46.115+02:00",
      slot: { window_start: "2026-07-15T14:15:00.000+02:00", window_end: "2026-07-15T16:15:00.000+02:00" },
      status: "COMPLETED",
      orders: [
        {
          id: `${id}-o`,
          items: items.map(([product, count]) => ({
            type: "ORDER_LINE",
            id: `${id}-${product}`,
            items: [{ type: "ORDER_ARTICLE", id: product, name: `Product ${product}`, image_ids: ["img"], unit_quantity: "1 st", price: 100, max_count: 50 }],
            display_price: 100 * count,
            price: 100 * count,
            decorators: [{ type: "QUANTITY", quantity: count }],
          })),
        },
      ],
    });
    picnic.on("POST", "/deliveries/summary", json([delivery("d1", []), delivery("d2", [])]));
    picnic.on("GET", "/deliveries/d1", json({ ...delivery("d1", [["s1", 1], ["s2", 2]]), type: "DELIVERY" }));
    picnic.on("GET", "/deliveries/d2", json({ ...delivery("d2", [["s2", 1]]), type: "DELIVERY" }));
    const history = await desk.get("/api/desk/history");
    assert.equal(history.status, 200, JSON.stringify(history.body));
    assert.equal(history.body.deliveries, 2);
    assert.deepEqual(
      history.body.items.map((i: { item: { productId: string }; times: number }) => [i.item.productId, i.times]),
      [["s2", 2], ["s1", 1]]
    );
    const calls = picnic.seen.length;
    await desk.get("/api/desk/history");
    assert.equal(picnic.seen.length, calls, "the second time comes from the cache");
    await desk.get("/api/desk/history?refresh=1");
    assert.ok(picnic.seen.length > calls);
  });

  test("bought before: when Picnic fails, the last list still shows; without one, the failure is passed on", async () => {
    picnic.on("POST", "/deliveries/summary", json({ error: { message: "busy" } }, { status: 503 }));
    const none = await desk.get("/api/desk/history");
    assert.ok(none.status >= 400, `failure passed on, got ${none.status}`);
    const old = { builtAt: "2026-01-01T00:00:00.000Z", deliveries: 1, items: [] };
    writeFileSync(join(desk.dataDir, "history.json"), JSON.stringify(old));
    const kept = await desk.get("/api/desk/history?refresh=1");
    assert.equal(kept.status, 200);
    assert.deepEqual(kept.body, old, "an old list beats none");
  });

  test("shortcuts: a list that is too long or malformed is refused, and nothing changes", async () => {
    const before = (await desk.get("/api/desk/shortcuts")).body.shortcuts;
    const tooMany = Array.from({ length: 25 }, (_, i) => ({ label: `s${i}`, query: `q${i}` }));
    for (const bad of [tooMany, [{ label: "", query: "x" }], [{ label: "x".repeat(41), query: "x" }], "nope", [{ label: "x" }]]) {
      assert.equal((await desk.post("/api/desk/shortcuts", { shortcuts: bad }, "PUT")).status, 400, JSON.stringify(bad).slice(0, 40));
    }
    assert.equal((await desk.post("/api/desk/shortcuts", "not json", "PUT")).status, 400);
    assert.deepEqual((await desk.get("/api/desk/shortcuts")).body.shortcuts, before);
  });

  test("a recipe price is only worked out for a recipe id", async () => {
    for (const bad of ["", "abc", "../../etc", "0123456789abcdef0123456X"]) {
      assert.equal((await desk.get(`/api/desk/recipe-price?id=${encodeURIComponent(bad)}`)).status, 400, bad);
    }
  });

  test("bought before: a list still being built when signing out is not kept", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    picnic.on("POST", "/deliveries/summary", async () => {
      await held;
      return json([]);
    });
    const building = desk.get("/api/desk/history?refresh=1");
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await desk.post("/api/auth/logout", {})).status, 200);
    release();
    await building;
    assert.equal(existsSync(join(desk.dataDir, "history.json")), false, "nothing of the old account written");
  });

  test("a recipe's price: worked out once, kept, and a few recipes at a time", async () => {
    let inFlight = 0;
    let most = 0;
    let pageCalls = 0;
    const id = (n: number) => `64a0000000000000000000${String(n).padStart(2, "0")}`;
    picnic.on("GET", /^\/pages\/selling-group-details-page/, async () => {
      pageCalls += 1;
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 25));
      inFlight -= 1;
      return json({ body: {} });
    });
    const answers = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => desk.get(`/api/desk/recipe-price?id=${id(n)}`)));
    assert.deepEqual(answers.map((a) => a.status), [200, 200, 200, 200, 200, 200], JSON.stringify(answers.map((a) => a.body)));
    assert.equal(most, 2, "two recipes at a time");
    assert.equal(picnic.seen.filter((x) => x.url.pathname.includes("product-details")).length, 0, "no product page per ingredient");
    assert.equal(answers[0].body.id, id(1));
    assert.equal(typeof answers[0].body.perServing, "number");
    const calls = pageCalls;
    // Asked again, also at the same moment: answered from what is kept.
    await Promise.all([desk.get(`/api/desk/recipe-price?id=${id(1)}`), desk.get(`/api/desk/recipe-price?id=${id(1)}`)]);
    assert.equal(pageCalls, calls);
    const kept = JSON.parse(readFileSync(join(desk.dataDir, "recipe_prices.json"), "utf8"));
    assert.equal(Object.keys(kept).length, 6);
    assert.equal((await desk.get("/api/desk/recipe-price?id=nope")).status, 400);
  });

  test("raw pages: only page ids, sent back as a download", async () => {
    picnic.on("GET", /^\/pages\/category-tree-root/, json({ hello: "world" }));
    const raw = await desk.get("/api/desk/raw?page=category-tree-root");
    assert.equal(raw.status, 200);
    assert.match(raw.headers.get("content-disposition") ?? "", /attachment; filename="picnic-category-tree-root.json"/);
    for (const bad of ["../user", "a b", "x".repeat(90), "page?x=<script>"]) {
      assert.equal((await desk.get(`/api/desk/raw?page=${encodeURIComponent(bad)}`)).status, 400, bad);
    }
  });
});

describe("calls to Picnic cannot hang", () => {
  const original = globalThis.fetch;
  after(() => {
    globalThis.fetch = original;
  });
  test("a call without its own time limit gets one", async () => {
    let signal: AbortSignal | undefined;
    globalThis.fetch = (async (_: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Response("ok");
    }) as typeof fetch;
    installFetchTimeout(1000);
    await fetch("https://example.invalid/");
    assert.ok(signal instanceof AbortSignal);
    const own = new AbortController();
    await fetch("https://example.invalid/", { signal: own.signal });
    assert.equal(signal, own.signal, "a caller's own signal is kept");
  });
});
