/**
 * The next/server stand-in: it must behave like Next.js for everything the
 * vendored routes use, and the routes must use nothing else.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { NextRequest, NextResponse, serializeCookie } from "../src/server/next-server";

const VENDOR = new URL("../vendor/picnic-web/src", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

test("the vendored code uses only the part of next/server that the stand-in provides", () => {
  const allowed = new Set([
    "NextResponse.json",
    "new NextResponse",
    "request.json",
    "request.nextUrl.searchParams.get",
    "request.nextUrl.origin",
    "request.cookies.get",
    "response.cookies.set",
  ]);
  const found = new Set<string>();
  for (const file of files(VENDOR)) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("next/")) continue;
    const imports = [...source.matchAll(/from "(next\/[^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(imports)], ["next/server"], `${file} imports ${imports}`);
    for (const m of source.matchAll(/NextResponse\.[a-zA-Z]+|new NextResponse|request\.[a-zA-Z]+(?:\.[a-zA-Z]+)*|response\.cookies\.[a-z]+/g)) {
      found.add(m[0]);
    }
  }
  const unknown = [...found].filter((use) => !allowed.has(use));
  assert.deepEqual(unknown, [], "picnic-web started using more of next/server; extend src/server/next-server.ts");
});

test("NextResponse.json is a JSON response with the given status", async () => {
  const response = NextResponse.json({ a: 1 }, { status: 409 });
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { a: 1 });
});

test("cookies set on a response become Set-Cookie headers", () => {
  const response = NextResponse.json({});
  response.cookies.set("picnic_auth_token", "a b", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 });
  response.cookies.set("picnic_country", "NL", { maxAge: 0 });
  assert.deepEqual(response.headers.getSetCookie(), [
    "picnic_auth_token=a%20b; Path=/; Max-Age=60; HttpOnly; SameSite=Lax",
    "picnic_country=NL; Max-Age=0",
  ]);
  assert.equal(serializeCookie("x", "y", { secure: true, sameSite: true }), "x=y; Secure; SameSite=Strict");
});

test("NextRequest reads JSON like Request.json, and cookies and query like Next.js", async () => {
  const request = new NextRequest("http://x/api/search?q=tofu", {
    method: "post",
    body: '{"a":1}',
    cookies: { picnic_country: "DE" },
    origin: "https://ha.example/api/hassio_ingress/abc",
  });
  assert.equal(request.method, "POST");
  assert.deepEqual(await request.json(), { a: 1 });
  assert.equal(request.nextUrl.searchParams.get("q"), "tofu");
  assert.equal(request.nextUrl.origin, "https://ha.example/api/hassio_ingress/abc");
  assert.equal(request.cookies.get("picnic_country")?.value, "DE");
  assert.equal(request.cookies.get("missing"), undefined);
  await assert.rejects(new NextRequest("http://x/").json(), SyntaxError);
  await assert.rejects(new NextRequest("http://x/", { body: "{nope" }).json(), SyntaxError);
  assert.equal(new NextRequest("http://x/y").nextUrl.origin, "http://x");
});
