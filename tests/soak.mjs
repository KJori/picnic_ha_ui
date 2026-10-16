// Weeks of use in a few minutes: mixed requests against picnic-web's real
// routes with Picnic faked, then whether memory, open handles and answer
// times stayed flat. Not part of `npm test` (it takes minutes):
//
//   node --expose-gc --import tsx --import ./tests/setup.ts tests/soak.mjs [rounds]
import { FAKE_SAFE_FETCH, FakePicnic, fixture, json, runDesk, signIn } from "./helpers.ts";
import { installFetchTimeout } from "../src/server/fetch-timeout.ts";

const ROUNDS = Number(process.argv[2] ?? 20);
const PER_ROUND = 1000;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4/+IOAAVNAqRW9JQaAAAAAElFTkSuQmCC", "base64");

const picnic = new FakePicnic().install();
installFetchTimeout(2000);
const desk = await runDesk({ pictureCacheMb: 1 });
await signIn(desk, picnic);
picnic.on("GET", /^\/pages\/search-page-results/, json(fixture("search_page_nl.json")));
picnic.on("GET", /^\/cart/, json({ type: "ORDER", id: "shopping_cart", items: [], total_count: 0, total_price: 0 }));
picnic.on("POST", /^\/cart\/add_product/, json({ type: "ORDER", id: "shopping_cart", items: [], total_count: 0, total_price: 0 }));
picnic.on("POST", "/deliveries/summary", json([]));
picnic.on("GET", /\/static\/images\//, () => new Response(Buffer.concat([PNG, Buffer.alloc(2000)])));
picnic.on("GET", /^\/pages\/recipe-details-page/, json({}));
picnic.on("GET", /^\/user$/, () => new Response("nope", { status: 503 }));

const calls = [
  () => ["GET", "search?q=melk"],
  () => ["GET", "cart"],
  () => ["POST", "cart", { productId: "s1", action: "add", count: 1 }],
  () => ["GET", `desk/image?id=${Math.random().toString(36).slice(2).padEnd(12, "x")}`], // ever new pictures
  () => ["GET", "desk/history?refresh=1"],
  () => ["GET", `desk/recipe-price?id=${Math.floor(Math.random() * 2 ** 48).toString(16).padStart(24, "0")}`], // ever new recipes
  () => ["GET", "user/profile"], // failing
  () => ["GET", "desk/state"],
];

// SOAK_ONLY=desk/state,cart runs only those, to find what slows down.
if (process.env.SOAK_ONLY) {
  const only = process.env.SOAK_ONLY.split(",");
  calls.splice(0, calls.length, ...calls.filter((c) => only.some((o) => c()[1].startsWith(o))));
}

const gc = globalThis.gc ?? (() => {});
const handles = () => process.getActiveResourcesInfo().filter((r) => r !== "TTYWrap").length;
const rows = [];
for (let round = 1; round <= ROUNDS; round++) {
  const times = [];
  const byKind = {};
  const work = Array.from({ length: PER_ROUND }, (_, i) => calls[i % calls.length]());
  // Ten at a time, like a few open tabs.
  for (let i = 0; i < work.length; i += 10) {
    await Promise.all(
      work.slice(i, i + 10).map(async ([method, path, body]) => {
        const started = performance.now();
        const response = await FAKE_SAFE_FETCH(`${desk.base}/api/${path}`, {
          method,
          headers: body ? { "x-desk-base": desk.base, "content-type": "application/json" } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        await response.arrayBuffer();
        if (response.status === 500) throw new Error(`500 from ${path}`);
        times.push(performance.now() - started);
        const kind = path.split(/[?/]/).slice(0, 2).join("/");
        (byKind[kind] ??= []).push(performance.now() - started);
      })
    );
  }
  picnic.seen.length = 0; // the fake keeps every request; the app must not
  gc();
  await new Promise((r) => setTimeout(r, 50));
  gc();
  times.sort((a, b) => a - b);
  const kept = desk.desk.desk.pictures.stored;
  rows.push({
    round,
    heapMB: +(process.memoryUsage().heapUsed / 1048576).toFixed(1),
    rssMB: +(process.memoryUsage().rss / 1048576).toFixed(1),
    handles: handles(),
    p50ms: +times[Math.floor(times.length / 2)].toFixed(1),
    p95ms: +times[Math.floor(times.length * 0.95)].toFixed(1),
    pictures: kept.count,
    pictureKB: Math.round(kept.bytes / 1024),
  });
  rows.at(-1).median = Object.fromEntries(
    Object.entries(byKind).map(([k, v]) => [k, +v.sort((a, b) => a - b)[Math.floor(v.length / 2)].toFixed(1)])
  );
  console.log(JSON.stringify(rows.at(-1)));
}

const first = rows[Math.min(2, rows.length - 1)]; // after warm-up
const last = rows.at(-1);
console.log(
  `heap ${first.heapMB} → ${last.heapMB} MB, handles ${first.handles} → ${last.handles}, p95 ${first.p95ms} → ${last.p95ms} ms, pictures kept ${last.pictures} (${last.pictureKB} KB of 1024)`
);
picnic.restore();
await desk.close();
