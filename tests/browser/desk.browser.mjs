// Picnic Desk in a real browser, against the demo shop, behind a stand-in for
// Home Assistant's ingress (the page lives under /api/hassio_ingress/<token>/).
//
//   npm run test:browser          (needs Playwright's Chromium)
//   SHOTS=dir npm run test:browser   also saves screenshots
//
// Runs the built app (picnic_desk/dist), so build first.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const { chromium } = playwright.default ?? playwright;

const ROOT = new URL("../..", import.meta.url).pathname;
const PREFIX = "/api/hassio_ingress/Abc123token";
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let app;
let proxy;
let browser;
let base;
let dataDir;

async function freePort() {
  return new Promise((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "desk-browser-"));
  const appPort = await freePort();
  app = spawn(process.execPath, [join(ROOT, "picnic_desk/dist/server.mjs")], {
    env: { ...process.env, PORT: String(appPort), DATA_DIR: dataDir, PICNIC_DEMO: "1", INGRESS_ONLY: "0", DESK_LANGUAGE: "en" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    app.stdout.on("data", (chunk) => String(chunk).includes("on port") && resolve());
    app.on("exit", (code) => reject(new Error(`app exited with ${code}`)));
  });
  // Home Assistant's ingress: strips the prefix and passes the rest on.
  proxy = createServer((req, res) => {
    if (!req.url.startsWith(`${PREFIX}/`)) {
      res.writeHead(req.url === PREFIX ? 301 : 404, req.url === PREFIX ? { location: `${PREFIX}/` } : {});
      res.end();
      return;
    }
    const upstream = httpRequest(
      { host: "127.0.0.1", port: appPort, path: req.url.slice(PREFIX.length), method: req.method, headers: req.headers },
      (answer) => {
        res.writeHead(answer.statusCode, answer.headers);
        answer.pipe(res);
      }
    );
    req.pipe(upstream);
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${proxy.address().port}${PREFIX}/`;
  browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
});

after(async () => {
  await browser?.close();
  proxy?.close();
  app?.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

/** A page that fails the test on any console error or request outside the app. */
async function openPage({ width = 1440, height = 900, colorScheme = "light" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme });
  const page = await context.newPage();
  const problems = [];
  // The browser logs every 4xx answer; those are expected (an age check, a wrong code).
  // Server errors are not.
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && problems.push(`console: ${m.text()}`));
  page.on("response", (r) => r.status() >= 500 && problems.push(`${r.status()} from ${r.url()}`));
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith(base) && !url.startsWith("data:") && url !== "about:blank" && !url.startsWith("about:blank")) {
      problems.push(`request outside the app: ${url}`);
    }
  });
  page.problems = problems;
  await page.goto(base);
  return page;
}

/** The session lives on the server, so later pages may already be signed in. */
async function signIn(page) {
  await page.locator(".views, .signin").first().waitFor();
  if (await page.locator(".signin").count()) {
    await page.getByLabel("E-mail address").fill("demo@example.nl");
    await page.getByLabel("Password").fill("x");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await page.locator(".views").waitFor();
}

const shot = async (page, name) => SHOTS && page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const receiptTotal = (page) => page.locator(".receipt .total span").last().textContent();
const clean = (page) => assert.deepEqual(page.problems, []);
/** The amount a stepper shows, or 0 when the product is not in the basket. */
const amount = async (locator) => ((await locator.count()) ? Number(await locator.first().textContent()) : 0);
const cell = (page, id) => page.locator(`.products .product[data-product="${id}"]`).first();
const line = (page, id) => page.locator(`.till .receipt .line[data-product="${id}"]`);

describe("Picnic Desk in a browser", () => {
  test("signing in with a verification code, then out again", async () => {
    const page = await openPage();
    await page.getByLabel("E-mail address").fill("demo@example.nl");
    await page.getByLabel("Password").fill("2fa");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Verification code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await page.getByRole("alert").filter({ hasText: "verification code is wrong" }).waitFor();
    await page.getByRole("button", { name: "Send by e-mail" }).click();
    await page.getByText("sent to your e-mail address").waitFor();
    await page.getByLabel("Verification code").fill("123456");
    await page.getByRole("button", { name: "Verify" }).click();
    await page.locator(".receipt").waitFor();
    await page.getByText("Signed in as Demo Klant.").waitFor();
    await shot(page, "01-home");
    await page.locator(".receipt").getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
    clean(page);
    await page.context().close();
  });

  test("the desk layout: big search box, tabs, shelf, receipt on the right", async () => {
    const page = await openPage();
    await signIn(page);
    const tabs = await page.locator(".views a").allTextContents();
    assert.deepEqual(tabs, ["Search", "Categories", "Paste a list", "Bought before", "Saved", "Recipes", "Orders"]);
    const shelf = await page.locator(".shelf").boundingBox();
    const till = await page.locator(".till").boundingBox();
    assert.ok(till.x > shelf.x + shelf.width - 1, "the receipt is to the right of the shelf");
    await page.locator(".shortcuts .chip").first().waitFor();
    clean(page);
    await page.context().close();
  });

  test("categories, search with suggestions, several words at once, the basket and saving", async () => {
    const page = await openPage();
    await signIn(page);
    // Picnic's aisles on the left, a category's subcategories and products on the right.
    await page.locator(".views").getByRole("link", { name: "Categories" }).click();
    await page.locator(".aisles").getByRole("link", { name: /Brood & ontbijt/ }).click();
    await cell(page, "s1001").waitFor();
    await page.locator(".aisle-shelf .chips").getByRole("link", { name: "Croissants & koffiebroodjes" }).click();
    await cell(page, "s1003").waitFor();
    await shot(page, "02-category");

    // Suggestions while typing.
    await page.locator("#q").fill("tof");
    await page.getByRole("option", { name: "tofu" }).click();
    const tofu = cell(page, "s1004");
    await tofu.locator(".more").click();
    await tofu.locator(".more").click();
    await line(page, "s1004").locator("output").filter({ hasText: "2" }).waitFor();
    assert.equal(await receiptTotal(page), "3,58");

    // "More for less": the price follows the amount.
    await page.locator("#q").fill("havermelk");
    await page.locator("#q").press("Enter");
    const milk = cell(page, "s1006");
    await milk.locator(".more").click();
    await milk.locator(".more").click();
    await milk.locator(".price").filter({ hasText: "1,99" }).waitFor();

    // Several words separated by commas, each with its own row.
    await page.locator("#q").fill("tofu, appels");
    await page.locator("#q").press("Enter");
    await page.locator(".group > h3").filter({ hasText: "appels" }).waitFor();
    assert.deepEqual(await page.locator(".group > h3").allTextContents(), ["tofu", "appels"]);

    // Saving a product.
    await cell(page, "s1004").getByRole("button", { name: /^Save/ }).click();
    await page.locator(".views").getByRole("link", { name: "Saved" }).click();
    await cell(page, "s1004").waitFor();
    await shot(page, "03-saved");

    // Taking one off in the receipt.
    await line(page, "s1004").locator(".less").click();
    await line(page, "s1004").locator("output").filter({ hasText: "1" }).waitFor();
    clean(page);
    await page.context().close();
  });

  test("shortcuts can be edited in place", async () => {
    const page = await openPage();
    await signIn(page);
    await page.locator(".views").getByRole("link", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: "Edit shortcuts" }).click();
    await page.getByLabel("Shortcut name").fill("Ontbijt");
    await page.getByLabel("Search words").fill("brood, melk");
    await page.getByRole("button", { name: "Add shortcut" }).click();
    await page.getByRole("button", { name: "Remove the shortcut Ontbijt" }).waitFor();
    await page.getByRole("button", { name: "Done" }).click();
    await page.locator(".shortcuts").getByRole("link", { name: "Ontbijt" }).click();
    await page.locator(".group > h3").filter({ hasText: "melk" }).waitFor();
    clean(page);
    await page.context().close();
  });

  test("a product's page as a sheet over the shelf", async () => {
    const page = await openPage();
    await signIn(page);
    await page.locator("#q").fill("tofu");
    await page.locator("#q").press("Enter");
    await cell(page, "s1004").locator(".name").click();
    const sheet = page.getByRole("dialog");
    await sheet.locator("h2.name").filter({ hasText: "Tofu naturel" }).waitFor();
    await sheet.getByText("Contains:").waitFor();
    await sheet.getByText("Voedingswaarde").click();
    await sheet.locator("table.nutrition").first().waitFor();
    const before = await amount(line(page, "s1004").locator("output"));
    await sheet.locator(".sheet-head .buy .more").click();
    await line(page, "s1004").locator("output").filter({ hasText: String(before + 1) }).waitFor();
    assert.match(page.url(), /product=s1004/);
    await shot(page, "04-product");
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached" });
    assert.doesNotMatch(page.url(), /product=/);
    clean(page);
    await page.context().close();
  });

  test("choosing a delivery time in the week grid", async () => {
    const page = await openPage();
    await signIn(page);
    await page.locator(".receipt .slot-line button").click();
    const sheet = page.getByRole("dialog");
    await sheet.locator(".week .day").first().waitFor();
    assert.ok((await sheet.locator(".week .day").count()) >= 3, "several days side by side");
    const days = await Promise.all([0, 1].map((i) => sheet.locator(".week .day").nth(i).boundingBox()));
    assert.equal(Math.round(days[0].y), Math.round(days[1].y), "the days are columns, not a list");
    await shot(page, "05-slots");
    await sheet.locator(".week .day").nth(1).locator(".slot:not([disabled])").first().click();
    await sheet.waitFor({ state: "detached" });
    await page.locator(".receipt .slot-line").filter({ hasText: "Delivery:" }).waitFor();
    clean(page);
    await page.context().close();
  });

  test("recipes: price on the card, portions, unticking, swapping, adding as a recipe", async () => {
    const page = await openPage();
    await signIn(page);
    await page.locator(".views").getByRole("link", { name: "Recipes" }).click();
    const card = page.locator('.recipe-card[data-recipe="64a000000000000000000001"]');
    await card.locator(".cost").filter({ hasText: "€" }).waitFor();
    await shot(page, "06-recipes");
    await card.locator("a.recipe").click();
    await page.getByRole("heading", { name: "Rode linzencurry met spinazie" }).waitFor();
    // Untick the rice, three people.
    await page.locator('.ingredient[data-product="s1025"] input[type="checkbox"]').uncheck();
    await page.getByRole("button", { name: "More portions" }).click();
    await page.locator(".portions output").filter({ hasText: "3" }).waitFor();
    await page.locator(".recipe-body:not(.refreshing)").waitFor();
    // Swap the onion for garlic.
    await page.getByRole("button", { name: "Change ingredient: Rode ui" }).click();
    const editor = page.getByRole("dialog");
    await editor.locator(".pick").filter({ hasText: "Knoflook" }).click();
    await editor.getByRole("button", { name: "Save" }).click();
    await editor.waitFor({ state: "detached" });
    await page.locator('.ingredient[data-product="s1016"]').waitFor();
    await shot(page, "07-recipe");
    await page.getByRole("button", { name: "Add 5 ingredients to the basket" }).click();
    await page.locator(".receipt .line-head").filter({ hasText: "Rode linzencurry" }).waitFor();
    assert.equal(await line(page, "s1025").count(), 0, "the unticked rice stays out");
    clean(page);
    await page.context().close();
  });

  test("a meal plan and its shopping list", async () => {
    const page = await openPage();
    await signIn(page);
    await page.locator(".views").getByRole("link", { name: "Recipes" }).click();
    await page.locator(".recipe-card").first().waitFor();
    await page.locator(".chips").getByRole("link", { name: /Meal plan/ }).click();
    await page.locator(".plan-bar input").first().fill("2");
    await page.getByRole("button", { name: "Make a plan" }).click();
    await page.locator(".recipe-card").nth(1).waitFor();
    await page.getByRole("button", { name: "Show shopping list" }).click();
    const list = page.getByRole("dialog");
    await list.getByText("packages saved").waitFor();
    await list.getByRole("button", { name: "Add everything to the basket" }).click();
    await list.getByRole("button", { name: "Added!" }).waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".receipt .line-head").first().waitFor();
    clean(page);
    await page.context().close();
  });

  test("checking out: age check, paying in a new tab, the order confirmed", async () => {
    const page = await openPage();
    await signIn(page);
    await page.locator("#q").fill("koffie");
    await page.locator("#q").press("Enter");
    const coffee = cell(page, "s1024");
    for (let i = 0; i < 4; i++) await coffee.locator(".more").click();
    await line(page, "s1024").locator("output").filter({ hasText: "4" }).waitFor();
    await page.locator(".receipt").getByRole("button", { name: "Check out" }).click();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    const age = page.getByRole("dialog");
    await age.getByText("18").first().waitFor();
    await age.getByRole("button", { name: "Confirm" }).click();
    await page.getByRole("button", { name: "Pay at the bank" }).waitFor();
    await shot(page, "08-checkout");
    const confirms = [];
    page.on("request", (r) => r.url().includes("/api/cart/checkout/confirm") && confirms.push(r.url()));
    const [tab] = await Promise.all([page.context().waitForEvent("page"), page.getByRole("button", { name: "Pay at the bank" }).click()]);
    tab.on("request", (r) => r.url().includes("/api/cart/checkout/confirm") && confirms.push(r.url()));
    // The demo's "bank" sends its tab straight back into the app, as a real bank does after paying.
    await tab.waitForURL(/#\/(checkout\/return|orders)/);
    await page.getByText("Status: PENDING").or(page.getByText("Status: FINISHED")).waitFor();
    // Whichever tab sees the payment finish first confirms; both end on the orders.
    await Promise.any([page, tab].map((p) => p.getByText("Order placed").waitFor({ timeout: 15000 })));
    await page.waitForURL(/#\/orders/, { timeout: 15000 });
    await tab.waitForURL(/#\/orders/, { timeout: 15000 });
    await page.locator(".receipt .empty-basket").waitFor();
    assert.equal(confirms.length, 1, "the order is confirmed once, by one tab");
    await tab.close();
    clean(page);
    await page.context().close();
  });

  test("orders: a table, tracking, rating, cancelling, parcels", async () => {
    const page = await openPage();
    await signIn(page);
    await page.locator(".views").getByRole("link", { name: "Orders" }).click();
    await page.locator("table.orders").getByText("Follow live").waitFor();
    await shot(page, "09-orders");
    await page.locator('table.orders a[href*="demo-delivery-current"]').click();
    await page.locator("svg.route").waitFor();
    await page.getByText("Expected arrival").waitFor();
    await shot(page, "10-tracking");
    await page.getByRole("button", { name: "Cancel the order" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
    await page.getByText("The order is cancelled.").waitFor();
    await page.goto(`${base}#/orders/demo-delivery-1`);
    await page.getByRole("radio", { name: "9" }).click();
    await page.getByRole("button", { name: "Send rating" }).click();
    await page.getByText("Thank you for your rating!").waitFor();
    await page.getByRole("button", { name: "Put these in the basket again" }).click();
    await line(page, "s1013").waitFor();
    await page.goto(`${base}#/parcels`);
    await page.getByText("DHL-pakket").click();
    await page.getByText("Jouw pakketje").waitFor();
    clean(page);
    await page.context().close();
  });

  test("a pasted list, bought before, and the self-check", async () => {
    const page = await openPage();
    await signIn(page);
    await page.request.delete(`${base}api/cart`, { headers: { "x-desk-base": base } });
    await page.reload();
    await page.locator(".views").waitFor();
    await page.locator(".views").getByRole("link", { name: "Paste a list" }).click();
    await page.locator("#list-text").fill("2 appels\ntofu\nonbekend product xyz");
    await page.getByRole("button", { name: "Find these products" }).click();
    await page.locator(".wanted").first().locator(".product .more").first().click();
    await line(page, "s1012").locator("output").filter({ hasText: "2" }).waitFor();
    await page.locator(".wanted.done").first().waitFor();
    await page.getByText("No products match “onbekend product xyz”").waitFor();
    await page.locator(".views").getByRole("link", { name: "Bought before" }).click();
    await page.locator(".products .product").first().waitFor();
    await page.locator(".receipt").getByRole("link", { name: "Check what works with Picnic" }).click();
    await page.locator(".checks li").nth(8).waitFor();
    assert.equal(await page.locator(".checks li.broken").count(), 0);
    await shot(page, "11-check");
    clean(page);
    await page.context().close();
  });

  test("on a narrow screen the receipt goes under the shelf", async () => {
    const page = await openPage({ width: 820, height: 1000 });
    await signIn(page);
    const shelf = await page.locator(".shelf").boundingBox();
    const till = await page.locator(".till").boundingBox();
    assert.ok(till.y >= shelf.y + shelf.height - 1, "the receipt is below the shelf");
    await shot(page, "12-narrow");
    clean(page);
    await page.context().close();
  });

  test("dark mode and the keyboard: /, Enter, +, arrows, s", async () => {
    const page = await openPage({ colorScheme: "dark" });
    await signIn(page);
    await page.evaluate(() => (document.activeElement)?.blur?.());
    await page.keyboard.press("/");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "q");
    await page.keyboard.type("tofu");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.closest(".product")?.getAttribute("data-product") === "s1004");
    const before = await amount(cell(page, "s1004").locator("output"));
    await page.keyboard.press("+");
    await cell(page, "s1004").locator("output").filter({ hasText: String(before + 1) }).waitFor();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => document.activeElement?.closest(".product")?.getAttribute("data-product")), "s1005");
    await page.keyboard.press("s");
    await cell(page, "s1005").locator('.star[aria-pressed="true"]').waitFor();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").locator("h2.name").filter({ hasText: "Gerookte tofu" }).waitFor();
    await shot(page, "13-dark");
    clean(page);
    await page.context().close();
  });
});
