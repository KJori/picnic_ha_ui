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

import { audit } from "./a11y.mjs";

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
  // Stopping writes what is pending; remove the folder once it has.
  if (app && app.exitCode === null) {
    await new Promise((resolve) => {
      app.once("exit", resolve);
      app.kill();
    });
  }
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
/** The receipt's total once every click has been answered (amounts show at once, the total follows Picnic). */
const receiptTotal = async (page) => {
  await page.locator('.till .receipt[aria-busy="false"]').waitFor();
  return page.locator(".receipt .total span").last().textContent();
};
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
    // What the page keeps in the browser goes with signing out; Home Assistant's own storage stays.
    await page.evaluate(() => {
      localStorage.setItem("picnic_desk_list", "2 havermelk");
      localStorage.setItem("picnic_desk_meal_plan", "{}");
      localStorage.setItem("hassTokens", "not ours");
    });
    await page.locator(".receipt").getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
    assert.deepEqual(
      await page.evaluate(() => Object.keys(localStorage).sort()),
      ["hassTokens"]
    );
    clean(page);
    await page.context().close();
  });

  test("the desk layout: big search box, tabs, shelf, receipt on the right", async () => {
    const page = await openPage();
    await signIn(page);
    const tabs = await page.locator(".views a").allTextContents();
    assert.deepEqual(tabs, ["Search", "Categories", "Paste a list", "Bought before", "Saved", "Lists", "Recipes", "Orders"]);
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

  // Every screen, in light and dark: names, contrast, target size, structure, focus.
  for (const colorScheme of ["light", "dark"]) {
    test(`accessibility, ${colorScheme}: every screen`, async () => {
      const page = await openPage({ colorScheme });
      const found = [];
      const check = async (screen, options) => {
        for (const problem of await audit(page, options)) found.push(`${screen}: ${problem}`);
      };
      await page.evaluate(() => fetch("api/auth/logout", { method: "POST", headers: { "x-desk-base": location.href } }));
      await page.reload();
      await page.locator(".signin").waitFor();
      await check("sign-in", { focus: true });
      await signIn(page);
      const go = async (hash, ready) => {
        await page.goto(`${base}#${hash}`);
        await page.locator(ready).first().waitFor();
      };
      await go("/search", ".shortcuts");
      await check("search, empty", { focus: true });
      await go("/search?q=tofu", ".products .product");
      await cell(page, "s1004").locator(".more").click();
      await line(page, "s1004").waitFor();
      await check("search results", { focus: true });
      await go("/categories", ".aisles");
      await page.locator(".aisles .aisle").first().click();
      await page.locator(".aisle-shelf .products .product").first().waitFor();
      await check("categories");
      await go("/search?q=tofu&product=s1004", "dialog[open] h2.name");
      await check("product page");
      await page.keyboard.press("Escape");
      await go("/list", ".views");
      await check("pasted list");
      await go("/history", ".products .product, .hint");
      await check("bought before");
      await go("/saved", ".views");
      await check("saved");
      await page.evaluate(() =>
        fetch("api/desk/lists", {
          method: "PUT",
          headers: { "x-desk-base": location.href, "content-type": "application/json" },
          body: JSON.stringify({
            lists: [{ id: "a11y", name: "Weekly", updatedAt: new Date().toISOString(), items: [{ product: { id: "s1004", name: "Tofu naturel", imageId: "demo-s1004", unitQuantity: "375 g", displayPrice: 179 }, count: 2, maxCount: 99 }] }],
          }),
        })
      );
      await go("/lists", ".list-card");
      await check("lists");
      await page.locator(".till").getByRole("button", { name: "Save as list" }).click();
      await page.locator("dialog[open] #list-name").waitFor();
      await check("save as list");
      await page.keyboard.press("Escape");
      // The other colour scheme's run put the list in the basket already: start empty.
      await page.evaluate(() => fetch("api/cart", { method: "DELETE", headers: { "x-desk-base": location.href } }));
      await page.reload();
      await page.locator(".till .receipt .empty-basket").waitFor();
      await page.locator(".list-card").getByRole("button", { name: "Put in the basket" }).click();
      await page.locator(".notice:not([hidden])").getByRole("button", { name: "Undo" }).waitFor();
      await check("a notice with Undo");
      await page.evaluate(() =>
        fetch("api/desk/picks", {
          method: "PUT",
          headers: { "x-desk-base": location.href, "content-type": "application/json" },
          body: JSON.stringify({ term: "tofu", product: { id: "s1005", name: "Gerookte tofu", imageId: "demo-s1005", unitQuantity: "200 g", displayPrice: 219 } }),
        })
      );
      await go("/list", ".paste");
      await page.locator("#list-text").fill("2 tofu");
      await page.locator(".paste button[type=submit]").click();
      await page.locator(".pick-note").waitFor();
      await check("pasted list with a pick");
      await go("/cookbook", ".recipe-card");
      await check("recipes");
      await page.locator(".recipe-card a.recipe").first().click();
      await page.locator(".ingredient").first().waitFor();
      await check("one recipe");
      await go("/orders", "table.orders");
      await check("orders");
      // Live, or cancelled by the orders test before this one: the page either way.
      await go("/orders/demo-delivery-current", ".bill");
      await check("one order");
      await go("/checkout", ".steps");
      await check("checkout");
      await page.locator(".till").getByRole("button", { name: /Change|Choose/ }).first().click();
      await page.locator("dialog[open] .week").waitFor();
      await check("delivery times");
      await page.keyboard.press("Escape");
      await go("/check", ".checks");
      await check("self-check");
      if (process.env.A11Y_REPORT) console.log(found.join("\n"));
      assert.deepEqual(found, []);
      clean(page);
      await page.context().close();
    });
  }

  test("a Dutch desk shows no English", async () => {
    // English strings that Dutch says differently, from the page's own tables.
    const tables = JSON.parse(
      await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            "-e",
            `import("./src/ui/i18n/index.ts").then(({ picnicStrings, deskStrings }) =>
              process.stdout.write(JSON.stringify({ en: { ...picnicStrings("en"), ...deskStrings("en") }, nl: { ...picnicStrings("nl"), ...deskStrings("nl") } })))`,
          ],
          { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] }
        );
        let out = "";
        child.stdout.on("data", (chunk) => (out += chunk));
        child.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(`strings: exit ${code}`))));
      })
    );
    const english = new Set(
      Object.entries(tables.en)
        .filter(([key, value]) => typeof value === "string" && !value.includes("{") && value !== tables.nl[key] && /[a-z]{3}/.test(value))
        .map(([, value]) => value.trim())
    );

    const port = await freePort();
    const folder = mkdtempSync(join(tmpdir(), "desk-nl-"));
    const dutch = spawn(process.execPath, [join(ROOT, "picnic_desk/dist/server.mjs")], {
      env: { ...process.env, PORT: String(port), DATA_DIR: folder, PICNIC_DEMO: "1", INGRESS_ONLY: "0", DESK_LANGUAGE: "nl" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      await new Promise((resolve) => dutch.stdout.on("data", (chunk) => String(chunk).includes("on port") && resolve()));
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL" });
      const page = await context.newPage();
      const root = `http://127.0.0.1:${port}/`;
      const found = new Set();
      const look = async (screen) => {
        const shown = await page.evaluate(() => {
          const out = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const el = n.parentElement;
            if (el && !el.closest("[hidden]") && n.textContent.trim()) out.push(n.textContent.trim());
          }
          for (const el of document.querySelectorAll("[aria-label], [title], [placeholder], [alt]")) {
            for (const name of ["aria-label", "title", "placeholder", "alt"]) {
              const v = el.getAttribute(name);
              if (v && v.trim()) out.push(v.trim());
            }
          }
          out.push(document.title.replace(/ · Picnic$/, ""));
          return out;
        });
        for (const text of shown) if (english.has(text)) found.add(`${screen}: "${text}"`);
      };
      // The screen before the app has answered follows the browser's language.
      await page.route("**/api/desk/state", async (route) => {
        await look("starting");
        await route.continue();
      });
      await page.goto(root);
      await page.locator(".signin").waitFor();
      await page.unroute("**/api/desk/state");
      await look("sign-in");
      await page.getByLabel("E-mailadres").fill("demo@example.nl");
      await page.getByLabel("Wachtwoord").fill("x");
      await page.locator(".signin button[type=submit]").click();
      await page.locator(".views").waitFor();
      const screens = [
        ["/search", ".shortcuts"],
        ["/search?q=tofu", ".products .product"],
        ["/search?q=tofu,brood", ".group"],
        ["/categories", ".aisles"],
        ["/search?q=tofu&product=s1004", "dialog[open] h2.name"],
        ["/list", ".views"],
        ["/history", ".products .product, .hint"],
        ["/saved", ".views"],
        ["/lists", ".views"],
        ["/cookbook", ".recipe-card"],
        ["/cookbook?plan=1", ".plan-bar, .recipe-card, .hint"],
        ["/orders", "table.orders"],
        ["/orders/demo-delivery-current", "svg.route"],
        ["/orders/demo-delivery-1", ".bill"],
        ["/parcels", ".views"],
        ["/checkout", ".checkout"],
        ["/check", ".checks"],
      ];
      for (const [hash, ready] of screens) {
        await page.goto(`${root}#${hash}`);
        await page.locator(ready).first().waitFor();
        // Something in the basket, so the receipt and checkout show all their parts.
        if (hash === "/search?q=tofu") {
          await page.locator('.products .product[data-product="s1004"] .more').click();
          await page.locator('.till .receipt[aria-busy="false"] .line').first().waitFor();
        }
        await look(hash);
      }
      await page.goto(`${root}#/cookbook`);
      await page.locator(".recipe-card a.recipe").first().click();
      await page.locator(".ingredient").first().waitFor();
      await look("one recipe");
      // A list, its save dialog, a notice with Undo, and a pasted line with a pick.
      await page.locator(".till button", { hasText: "Bewaar als lijstje" }).click();
      await page.locator("dialog[open] #list-name").waitFor();
      await look("save as list");
      await page.locator("dialog[open] button[type=submit]").click();
      await page.goto(`${root}#/lists`);
      await page.locator(".list-card").waitFor();
      await look("lists");
      await page.locator(".list-card .primary").click();
      await page.locator(".notice:not([hidden])").waitFor();
      await look("notice");
      await page.goto(`${root}#/list`);
      await page.locator("#list-text").fill("tofu");
      await page.locator(".paste button[type=submit]").click();
      await page.locator(".wanted .product .more").first().click();
      await page.reload();
      await page.locator(".paste button[type=submit]").click();
      await page.locator(".pick-note").waitFor();
      await look("pasted list with a pick");
      if (process.env.A11Y_REPORT) console.log([...found].join("\n"));
      assert.deepEqual([...found], []);
      await context.close();
    } finally {
      // Stopping writes what is pending; remove the folder once it has.
      await new Promise((resolve) => {
        dutch.once("exit", resolve);
        dutch.kill();
      });
      rmSync(folder, { recursive: true, force: true });
    }
  });

  /** The demo basket is shared by the tests: start from an empty one. */
  const emptyBasket = async (page) => {
    await page.evaluate(() => fetch("api/cart", { method: "DELETE", headers: { "x-desk-base": location.href } }));
    await page.reload();
    await page.locator(".till .receipt .empty-basket").waitFor();
  };
  const notice = (page) => page.locator(".notice:not([hidden])");
  /** Lists and picks are shared by the tests too (the accessibility runs make some). */
  const forgetListsAndPicks = (page) =>
    page.evaluate(async () => {
      const headers = { "x-desk-base": location.href, "content-type": "application/json" };
      await fetch("api/desk/lists", { method: "PUT", headers, body: JSON.stringify({ lists: [] }) });
      for (const term of ["tofu", "havermelk"]) {
        await fetch("api/desk/picks", { method: "PUT", headers, body: JSON.stringify({ term, product: null }) });
      }
    });

  test("lists: save the basket, put it back topped up, undo, edit, delete", async () => {
    const page = await openPage();
    await signIn(page);
    await forgetListsAndPicks(page);
    await emptyBasket(page);
    await page.goto(`${base}#/search?q=tofu`);
    await cell(page, "s1004").locator(".more").click();
    await cell(page, "s1004").locator(".more").click();
    await page.goto(`${base}#/search?q=brood`);
    await cell(page, "s1001").locator(".more").click();
    await line(page, "s1001").waitFor();
    await page.locator('.till .receipt[aria-busy="false"]').waitFor();

    await page.locator(".till").getByRole("button", { name: "Save as list" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name of the list").fill("Weekly");
    await dialog.getByRole("button", { name: "Save" }).click();
    await notice(page).filter({ hasText: "Saved as “Weekly”." }).waitFor();

    // Emptying the basket can be undone.
    await page.locator(".till").getByRole("button", { name: "Empty the basket" }).click();
    await page.locator(".till").getByRole("button", { name: "Click again to empty it" }).click();
    await notice(page).filter({ hasText: "The basket is empty." }).getByRole("button", { name: "Undo" }).click();
    await line(page, "s1004").locator("output").filter({ hasText: "2" }).waitFor();
    await line(page, "s1001").waitFor();

    // With one tofu left, the list tops up to two and adds the bread.
    await line(page, "s1004").locator(".less").click();
    await page.locator(".till").getByRole("button", { name: "Empty the basket" }).click(); // arm, then let it lapse
    await page.locator(".views").getByRole("link", { name: "Lists" }).click();
    const card = page.locator(".list-card").first(); // the only list
    await card.locator("h3", { hasText: "Weekly" }).waitFor();
    await card.getByText("2 products").waitFor();
    await page.waitForTimeout(4200); // the emptying confirmation lapses
    await line(page, "s1001").locator(".less").click();
    await page.locator('.till .receipt[aria-busy="false"]').waitFor();
    assert.equal(await page.locator(".till .receipt .line[data-product='s1001']").count(), 0);
    await card.getByRole("button", { name: "Put in the basket" }).click();
    await notice(page).filter({ hasText: "2 products put in the basket." }).waitFor();
    await line(page, "s1004").locator("output").filter({ hasText: "2" }).waitFor();
    await line(page, "s1001").locator("output").filter({ hasText: "1" }).waitFor();
    // Undo takes back exactly what the list added: one tofu and the bread.
    await notice(page).getByRole("button", { name: "Undo" }).click();
    await line(page, "s1004").locator("output").filter({ hasText: "1" }).waitFor();
    await page.locator(".till .receipt .line[data-product='s1001']").waitFor({ state: "detached" });

    // Edit: one more bread, no tofu, a new name; kept on the server.
    await card.locator('.list-items li[data-product="s1001"] .more').click();
    await card.locator('.list-items li[data-product="s1001"] output').filter({ hasText: "2" }).waitFor();
    await card.getByRole("button", { name: "Take Tofu naturel off the list" }).click();
    await card.getByRole("button", { name: "Rename" }).click();
    await card.getByLabel("Name of the list").fill("Basics");
    await card.getByRole("button", { name: "Save" }).click();
    await page.reload();
    const renamed = page.locator(".list-card").filter({ hasText: "Basics" });
    await renamed.getByText("1 product", { exact: false }).waitFor();
    assert.equal(await renamed.locator('.list-items li[data-product="s1004"]').count(), 0);
    await shot(page, "14-lists");
    await renamed.getByRole("button", { name: "Delete" }).click();
    await renamed.getByRole("button", { name: "Click again to delete" }).click();
    await page.getByText("No lists yet.").waitFor();
    clean(page);
    await page.context().close();
  });

  test("taking a product out of the basket can be undone", async () => {
    const page = await openPage();
    await signIn(page);
    await emptyBasket(page);
    await page.goto(`${base}#/search?q=tofu`);
    await cell(page, "s1004").locator(".more").click();
    await line(page, "s1004").waitFor();
    await cell(page, "s1004").locator(".less").click();
    await notice(page).filter({ hasText: "Tofu naturel taken out of the basket." }).getByRole("button", { name: "Undo" }).click();
    await line(page, "s1004").locator("output").filter({ hasText: "1" }).waitFor();
    clean(page);
    await page.context().close();
  });

  test("a pasted list remembers the product picked for a line", async () => {
    const page = await openPage();
    await signIn(page);
    await forgetListsAndPicks(page);
    await emptyBasket(page);
    const paste = async () => {
      await page.goto(`${base}#/list`);
      await page.getByLabel(/one product per line/i).fill("2 tofu\nhavermelk");
      await page.getByRole("button", { name: "Find these" }).click();
      await page.locator(".wanted").first().locator(".products .product").first().waitFor();
    };
    await paste();
    const tofu = page.locator(".wanted").filter({ has: page.locator("h3", { hasText: "tofu" }) });
    // Not the first match: the smoked one.
    await tofu.locator('.product[data-product="s1005"] .more').click();
    await line(page, "s1005").locator("output").filter({ hasText: "2" }).waitFor();
    await emptyBasket(page);

    await paste();
    const again = page.locator(".wanted").filter({ has: page.locator("h3", { hasText: "tofu" }) });
    await again.locator(".pick-note").filter({ hasText: "Gerookte tofu" }).waitFor();
    assert.equal(await again.locator(".products .product").first().getAttribute("data-product"), "s1005", "the pick comes first");
    await page.getByRole("button", { name: "Put my 1 usual picks in the basket" }).click();
    await line(page, "s1005").locator("output").filter({ hasText: "2" }).waitFor();
    await again.getByRole("button", { name: "Forget this pick" }).click();
    await again.locator(".pick-note").waitFor({ state: "detached" });
    assert.equal(await page.getByRole("button", { name: /usual picks/ }).count(), 0);
    clean(page);
    await page.context().close();
  });

  test("price per kilo on the shelf, and ordering by price or price per kilo", async () => {
    const page = await openPage();
    await signIn(page);
    await page.goto(`${base}#/search?q=tofu`);
    // Tofu naturel: 375 g for € 1,79 is € 4,77 per kilo.
    await cell(page, "s1004").locator(".meta").filter({ hasText: "375 g, € 4,77/kg" }).waitFor();
    const sort = page.getByRole("group", { name: "Order" });
    await sort.getByRole("button", { name: "Price per kg or litre" }).click();
    await sort.getByRole("button", { name: "Price per kg or litre", pressed: true }).waitFor();
    const perKilo = await page.locator(".view .products .product").evaluateAll((cells) =>
      cells.map((c) => {
        const m = /€\s*([\d.,]+)\/(kg|l)/.exec(c.querySelector(".meta")?.textContent ?? "");
        return m ? Number(m[1].replace(".", "").replace(",", ".")) : Infinity;
      })
    );
    const readable = perKilo.filter(Number.isFinite);
    assert.ok(readable.length >= 2, "several prices per kilo to order");
    assert.deepEqual(readable, [...readable].sort((a, b) => a - b), "cheapest per kilo first");
    await sort.getByRole("button", { name: "Price", exact: true }).click();
    const prices = await page.locator(".view .products .product .price").evaluateAll((els) =>
      els.map((e) => Number((e.textContent ?? "").replace(/[^\d,]/g, "").replace(",", ".")))
    );
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b), "cheapest first");
    await sort.getByRole("button", { name: "Picnic's order" }).click();
    clean(page);
    await page.context().close();
  });

  test("two tabs keep each other up to date at once", async () => {
    const first = await openPage();
    await signIn(first);
    await forgetListsAndPicks(first);
    await emptyBasket(first);
    const second = await first.context().newPage();
    second.problems = [];
    second.on("pageerror", (e) => second.problems.push(`page error: ${e.message}`));
    await second.goto(`${base}#/search?q=tofu`);
    await second.locator(".till .receipt .empty-basket").waitFor();

    // The basket: a click in one tab shows in the other, which is not touched.
    await first.goto(`${base}#/search?q=tofu`);
    await cell(first, "s1004").locator(".more").click();
    await line(second, "s1004").locator("output").filter({ hasText: "1" }).waitFor({ timeout: 3000 });
    await cell(second, "s1004").locator("output").filter({ hasText: "1" }).waitFor({ timeout: 3000 });

    // A star, a list and a pick.
    // (An earlier test may have starred it already: the other tab follows whichever way it goes.)
    const starred = (await cell(first, "s1005").locator(".star").getAttribute("aria-pressed")) === "true";
    await cell(first, "s1005").locator(".star").click();
    await cell(first, "s1005").locator(`.star[aria-pressed="${!starred}"]`).waitFor();
    await cell(second, "s1005").locator(`.star[aria-pressed="${!starred}"]`).waitFor({ timeout: 3000 });
    await second.goto(`${base}#/lists`);
    await second.getByText("No lists yet.").waitFor();
    await first.locator(".till").getByRole("button", { name: "Save as list" }).click();
    await first.getByRole("dialog").getByLabel("Name of the list").fill("From the other tab");
    await first.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await second.locator(".list-card h3", { hasText: "From the other tab" }).waitFor({ timeout: 3000 });

    // Signing out in one tab signs out the other.
    await first.locator(".till").getByRole("button", { name: "Sign out" }).click();
    await second.locator(".signin").waitFor({ timeout: 3000 });
    assert.deepEqual(second.problems, []);
    clean(first);
    await first.context().close();
  });

  // Answers in a shape the page does not expect (the app updated while the page stayed open):
  // each part of the desk shows its own message, nothing escapes, nothing goes blank.
  test("odd answers break one part at a time, never the whole page", async () => {
    const page = await openPage();
    await signIn(page);
    const escaped = [];
    page.on("pageerror", (e) => escaped.push(e.message));
    const shapes = [{}, [], null, { items: "x", products: {}, recipes: "x", deliveries: 5, nodes: "x", sections: {}, checks: "x" }];
    const screens = ["/search?q=tofu", "/search?q=tofu,brood", "/categories/l1-brood", "/search?q=tofu&product=s1004", "/list", "/history", "/saved", "/cookbook", "/orders", "/orders/demo-delivery-1", "/parcels", "/checkout", "/check"];
    const blank = [];
    for (const shape of shapes) {
      await page.route(/\/api\/(?!desk\/state|auth\/)/, (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(shape) })
      );
      for (const screen of screens) {
        await page.goto(`${base}#${screen}`);
        await page.waitForTimeout(400);
        // The tabs and the search box stay: the desk is still there around the broken part.
        if (!(await page.locator(".views a").count()) || !(await page.locator("#q").count())) blank.push(`${JSON.stringify(shape)} ${screen}`);
      }
      await page.unroute(/\/api\/(?!desk\/state|auth\/)/);
    }
    assert.deepEqual(blank, [], "no blank desk");
    assert.deepEqual([...new Set(escaped)], [], "nothing escaped");
    page.problems.length = 0; // the console logs each caught break; those are expected here
    await page.context().close();
  });

  test("a page left open while the app was updated says so and offers a reload", async () => {
    const page = await openPage();
    await signIn(page);
    await page.route("**/api/desk/state", async (route) => {
      const answer = await route.fetch();
      const state = await answer.json();
      await route.fulfill({ response: answer, json: { ...state, version: "9.9.9" } });
    });
    await page.evaluate(() => {
      // Coming back to the tab after a while asks the server again.
      Date.now = ((now) => () => now() + 5 * 60 * 1000)(Date.now);
      window.dispatchEvent(new Event("focus"));
    });
    await page.locator(".updated").getByRole("button", { name: "Reload the page" }).waitFor();
    await page.unroute("**/api/desk/state");
    await page.locator(".updated").getByRole("button", { name: "Reload the page" }).click();
    await page.locator(".views").waitFor();
    assert.equal(await page.locator(".updated").count(), 0, "gone after reloading into the new version");
    clean(page);
    await page.context().close();
  });
});
