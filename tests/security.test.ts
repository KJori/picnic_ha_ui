/**
 * Who may use the Picnic account, what reaches picnic-web's code, what leaves
 * the machine, and what the browser is told. Each test tries the attack.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import type { NextRequest } from "next/server";

import { installOnlyPicnic } from "../src/server/fetch-timeout";
import { FAKE_SAFE_FETCH, FakePicnic, json, runDesk, type Running } from "./helpers";

let picnic: FakePicnic;
let desk: Running;

/** Home Assistant users as ingress names them. */
const ANNA = { "x-remote-user-id": "a1", "x-remote-user-name": "anna", "x-remote-user-display-name": "Anna" };
const BOB = { "x-remote-user-id": "b2", "x-remote-user-name": "bob", "x-remote-user-display-name": "Bob" };

/** A request through a stand-in for Home Assistant's gateway, as `user`. */
async function as(user: Record<string, string>, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const writing = init.method !== undefined && init.method !== "GET";
  const response = await FAKE_SAFE_FETCH(`${desk.base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...user,
      ...(writing ? { "x-desk-base": desk.base, "content-type": "application/json" } : {}),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // text
  }
  return { status: response.status, body, headers: response.headers };
}

async function startAsHomeAssistant(allowedUsers: string[] = []) {
  // The tests connect from 127.0.0.1, so that plays Home Assistant's gateway.
  desk = await runDesk({ ingressOnly: true, gateway: "127.0.0.1", allowedUsers });
  picnic.on("GET", /^\/suggest/, json([]));
  picnic.on("GET", /^\/cart/, json({ type: "ORDER", id: "shopping_cart", items: [], total_count: 0, total_price: 0 }));
}

beforeEach(() => {
  picnic = new FakePicnic().install();
});
afterEach(async () => {
  picnic.restore();
  await desk?.close();
});

describe("the Picnic account belongs to whoever connected it", () => {
  test("another Home Assistant user can neither use, take over nor sign out the account", async () => {
    await startAsHomeAssistant();
    assert.equal((await as(ANNA, "/api/auth/login", { method: "POST", body: { token: "anna-token", countryCode: "NL" } })).status, 200);
    const saved = JSON.parse(readFileSync(join(desk.dataDir, "auth.json"), "utf8"));
    assert.deepEqual(saved.owner, { id: "a1", name: "anna", displayName: "Anna" });

    assert.equal((await as(ANNA, "/api/cart")).status, 200, "the owner gets in");
    const state = await as(BOB, "/api/desk/state");
    assert.equal(state.status, 200);
    assert.equal(state.body.notYours, true);
    assert.equal(state.body.signedIn, false, "nothing about the account is told");
    for (const [method, path, body] of [
      ["GET", "/api/cart", undefined],
      ["GET", "/api/user/profile", undefined],
      ["GET", "/api/deliveries", undefined],
      ["GET", "/api/desk/history", undefined],
      ["GET", "/api/desk/selfcheck", undefined],
      ["POST", "/api/cart", { productId: "s1", action: "add", count: 1 }],
      ["POST", "/api/auth/logout", {}],
      ["POST", "/api/auth/login", { token: "bob-token", countryCode: "NL" }],
    ] as const) {
      const answer = await as(BOB, path, { method, body });
      assert.equal(answer.status, 403, `${method} ${path}`);
      assert.equal(answer.body.code, "NOT_YOUR_ACCOUNT");
    }
    assert.equal(JSON.parse(readFileSync(join(desk.dataDir, "auth.json"), "utf8")).token, "anna-token", "still Anna's");
  });

  test("users named in allowed_users may use it too; names are not case-sensitive", async () => {
    await startAsHomeAssistant(["Bob"]);
    await as(ANNA, "/api/auth/login", { method: "POST", body: { token: "anna-token", countryCode: "NL" } });
    assert.equal((await as(BOB, "/api/cart")).status, 200);
    assert.equal((await as(BOB, "/api/desk/state")).body.notYours, false);
    const carol = { "x-remote-user-id": "c3", "x-remote-user-name": "carol" };
    assert.equal((await as(carol, "/api/cart")).status, 403);
  });

  test("signing out frees the account for the next person, and the rule survives a restart", async () => {
    await startAsHomeAssistant();
    await as(ANNA, "/api/auth/login", { method: "POST", body: { token: "anna-token", countryCode: "NL" } });
    assert.equal((await as(BOB, "/api/cart")).status, 403);
    assert.equal((await as(ANNA, "/api/auth/logout", { method: "POST", body: {} })).status, 200);
    assert.equal((await as(BOB, "/api/auth/login", { method: "POST", body: { token: "bob-token", countryCode: "NL" } })).status, 200);
    assert.equal((await as(ANNA, "/api/cart")).status, 403, "now it is Bob's");

    // The same data folder after a restart (closing the first run removes the folder, so it goes last).
    const restarted = await runDesk({ ingressOnly: true, gateway: "127.0.0.1", dataDir: desk.dataDir });
    const first = desk;
    desk = restarted;
    assert.equal((await as(ANNA, "/api/cart")).status, 403, "still Bob's after a restart");
    assert.equal((await as(BOB, "/api/desk/state")).body.signedIn, true);
    await first.close();
  });

  test("user headers are ignored when anyone could have sent them", async () => {
    desk = await runDesk(); // not behind Home Assistant: no gateway to trust
    picnic.on("GET", /^\/suggest/, json([]));
    picnic.on("GET", /^\/cart/, json({ type: "ORDER", id: "shopping_cart", items: [], total_count: 0, total_price: 0 }));
    await as(ANNA, "/api/auth/login", { method: "POST", body: { token: "anna-token", countryCode: "NL" } });
    assert.equal(JSON.parse(readFileSync(join(desk.dataDir, "auth.json"), "utf8")).owner, undefined);
    assert.equal((await as(BOB, "/api/cart")).status, 200);
  });
});

describe("requests", () => {
  test("picnic-web's code sees no cookies, no Home Assistant headers and no authorization", async () => {
    let seen: NextRequest | null = null;
    desk = await runDesk({
      demo: async (request) => {
        seen = request;
        return null;
      },
    });
    await FAKE_SAFE_FETCH(`${desk.base}/api/search?q=x`, {
      headers: {
        cookie: "ingress_session=secret",
        authorization: "Bearer ha-token",
        "x-remote-user-id": "a1",
        "x-hass-source": "core.ingress",
        "accept-language": "nl",
      },
    });
    assert.ok(seen);
    const names = [...(seen as NextRequest).headers.keys()].sort();
    assert.deepEqual(names, ["accept-language"]);
    assert.equal((seen as NextRequest).cookies.get("ingress_session"), undefined);
  });

  test("a change sent from another site is refused even with the app's header", async () => {
    desk = await runDesk();
    const response = await FAKE_SAFE_FETCH(`${desk.base}/api/cart`, {
      method: "DELETE",
      headers: { "x-desk-base": desk.base, "sec-fetch-site": "cross-site" },
    });
    assert.equal(response.status, 403);
    const sameSite = await FAKE_SAFE_FETCH(`${desk.base}/api/cart`, {
      method: "DELETE",
      headers: { "x-desk-base": desk.base, "sec-fetch-site": "same-site" },
    });
    assert.equal(sameSite.status, 403, "another app on a sibling host counts as elsewhere too");
  });

  test("every answer tells the browser not to share it with other sites or frame it elsewhere", async () => {
    desk = await runDesk();
    for (const path of ["/", "/app.js", "/api/desk/state", "/api/desk/image?id=nope"]) {
      const response = await FAKE_SAFE_FETCH(`${desk.base}${path}`);
      assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin", path);
      assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN", path);
      assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\).*geolocation=\(\)/, path);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer", path);
    }
    const policy = (await FAKE_SAFE_FETCH(`${desk.base}/`)).headers.get("content-security-policy") ?? "";
    assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
    assert.match(policy, /object-src 'none'/);
  });

  test("answers about the account are not kept in the browser's cache", async () => {
    desk = await runDesk();
    picnic.on("GET", /^\/cart/, json({}));
    const response = await FAKE_SAFE_FETCH(`${desk.base}/api/desk/state`);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

describe("the internet", () => {
  test("the app only reaches Picnic, over https", async () => {
    const reached: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      reached.push(String(input));
      return new Response("ok");
    }) as typeof fetch;
    try {
      installOnlyPicnic();
      for (const bad of [
        "https://example.com/collect",
        "http://storefront-prod.nl.picnicinternational.com/api/15/cart",
        "https://storefront-prod.nl.picnicinternational.com:8443/x",
        "https://storefront-prod.nl.picnicinternational.com.evil.example/x",
        "https://evil.example/?https://storefront-prod.nl.picnicinternational.com",
        "http://172.30.32.1:8123/api/states",
        "https://pages-prod.nl.picnicinternational.com.evil.example/store/x.script.bundle",
        "https://cdn-prod.nl.picnicinternational.com/x",
      ]) {
        await assert.rejects(globalThis.fetch(bad), /only talks to Picnic/, bad);
      }
      await globalThis.fetch("https://storefront-prod.de.picnicinternational.com/api/15/cart");
      // The scripts of Picnic's newer pages, which search reads.
      await globalThis.fetch("https://pages-prod.nl.picnicinternational.com/store/search.script.bundle");
      assert.deepEqual(reached, [
        "https://storefront-prod.de.picnicinternational.com/api/15/cart",
        "https://pages-prod.nl.picnicinternational.com/store/search.script.bundle",
      ]);
    } finally {
      globalThis.fetch = original;
    }
  });
});
