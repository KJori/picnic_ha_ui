/**
 * The route table covers picnic-web's routes, and finds them as Next.js would.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { NextResponse } from "../src/server/next-server";
import { Router, type RouteEntry } from "../src/server/router";
import { VENDORED_ROUTES } from "../src/server/routes.generated";
// @ts-expect-error plain JavaScript build script
import { routeFiles, SKIPPED } from "../scripts/routes.mjs";

test("every picnic-web route is served, except the ones skipped on purpose", () => {
  const served = VENDORED_ROUTES.map((r) => r.path).sort();
  const expected = (routeFiles() as string[]).filter((r) => !(r in SKIPPED)).sort();
  assert.deepEqual(served, expected);
  for (const skipped of Object.keys(SKIPPED)) assert.ok((routeFiles() as string[]).includes(skipped), `${skipped} no longer exists upstream`);
  for (const route of VENDORED_ROUTES) {
    assert.ok(route.methods.length > 0, route.path);
    for (const method of route.methods) assert.equal(typeof route.module[method as "GET"], "function", `${method} ${route.path}`);
  }
});

test("referral, family and wallet are not reachable", () => {
  const router = new Router(VENDORED_ROUTES);
  for (const path of ["user/referral", "user/family", "wallet", "wallet/balance", "wallet/transactions/t1"]) {
    assert.equal(router.match("GET", path.split("/")).kind, "none", path);
  }
});

test("fixed segments win over parameters, and parameters are passed on", () => {
  const handler = (name: string) => async () => NextResponse.json({ name });
  const routes: RouteEntry[] = [
    { path: "recipe/[id]", methods: ["GET"], module: { GET: handler("recipe") } },
    { path: "recipe/saved", methods: ["GET"], module: { GET: handler("saved") } },
    { path: "recipe/[id]/ingredient/[ingredientId]", methods: ["GET", "POST"], module: { GET: handler("ing"), POST: handler("ing") } },
  ];
  const router = new Router(routes);
  const saved = router.match("GET", ["recipe", "saved"]);
  assert.equal(saved.kind === "found" && saved.entry.path, "recipe/saved");
  const one = router.match("GET", ["recipe", "abc"]);
  assert.deepEqual(one.kind === "found" && one.params, { id: "abc" });
  const ing = router.match("POST", ["recipe", "a", "ingredient", "b"]);
  assert.deepEqual(ing.kind === "found" && ing.params, { id: "a", ingredientId: "b" });
  assert.deepEqual(router.match("DELETE", ["recipe", "a"]), { kind: "method", allowed: ["GET"] });
  assert.equal(router.match("GET", ["recipe", ""]).kind, "none");
  assert.equal(router.match("GET", ["recipe"]).kind, "none");
});
