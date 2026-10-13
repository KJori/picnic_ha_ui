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
  await page.locator(".views, .login-card").first().waitFor();
  if (await page.locator(".login-card").count()) {
    await page.getByLabel("E-mail address").fill("demo@example.nl");
    await page.getByLabel("Password").fill("x");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await page.locator(".views").waitFor();
}

const shot = async (page, name) => SHOTS && page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const receiptTotal = (page) => page.locator(".receipt .sum-total dd").textContent();
const clean = (page) => assert.deepEqual(page.problems, []);
/** The amount a stepper shows, or 0 when the product is not in the basket. */
const amount = async (locator) => ((await locator.count()) ? Number(await locator.first().textContent()) : 0);

describe("Picnic Desk in a browser", () => {
  test("signing in with a verification code, then out again", async () => {
    const page = await openPage();
    await page.getByLabel("E-mail address").fill("demo@example.nl");
    await page.getByLabel("Password").fill("2fa");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Verification code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await page.getByRole("alert").filter({ hasText: "verification code is wrong" }).waitFor();
    await page.getByRole("button", { name: "by e-mail" }).click();
    await page.getByText("sent to your e-mail address").waitFor();
    await page.getByLabel("Verification code").fill("123456");
    await page.getByRole("button", { name: "Verify" }).click();
    await page.locator(".receipt").waitFor();
    await shot(page, "01-home");
    await page.getByRole("link", { name: "Account" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
    clean(page);
    await page.context().close();
  });

  test("categories, search with suggestions, the basket and stars", async () => {
    const page = await openPage();
    await signIn(page);
    // Picnic's category tree, and down into a category.
    await page.getByRole("button", { name: /Brood & ontbijt/ }).click();
    await page.getByRole("link", { name: "Brood", exact: true }).click();
    await page.locator('.cell[data-product="s1001"]').waitFor();
    await shot(page, "02-category");

    // Suggestions while typing.
    await page.locator("#q").fill("tof");
    await page.getByRole("option", { name: "tofu" }).click();
    await page.locator('.cell[data-product="s1004"]').waitFor();
    const tofu = page.locator('.cell[data-product="s1004"]');
    await tofu.getByRole("button", { name: /Add to basket/ }).click();
    await tofu.getByRole("button", { name: /^Add 1/ }).click();
    await page.locator('.receipt .line[data-product="s1004"] output').filter({ hasText: "2" }).waitFor();
    assert.equal(await receiptTotal(page), "€3.58");

    // "More for less": the price follows the amount.
    await page.locator("#q").fill("havermelk");
    await page.locator("#q").press("Enter");
    const milk = page.locator('.cell[data-product="s1006"]');
    await milk.getByRole("button", { name: /Add to basket/ }).click();
    await milk.getByRole("button", { name: /^Add 1/ }).click();
    await milk.locator(".price-now").filter({ hasText: "€1.99" }).waitFor();

    // Stars.
    await tofu.isVisible().catch(() => {});
    await milk.getByRole("button", { name: /^Star/ }).click();
    await page.getByRole("link", { name: "Starred" }).click();
    await page.locator('.past-item[data-product="s1006"]').waitFor();
    await shot(page, "03-starred");

    // Taking one off in the receipt.
    await page.locator('.receipt .line[data-product="s1004"]').getByRole("button", { name: /^Remove 1/ }).click();
    await page.locator('.receipt .line[data-product="s1004"] output').filter({ hasText: "1" }).waitFor();
    clean(page);
    await page.context().close();
  });

  test("a product's page over the shelf", async () => {
    const page = await openPage();
    await signIn(page);
    await page.locator("#q").fill("tofu");
    await page.locator("#q").press("Enter");
    await page.locator('.cell[data-product="s1004"] .cell-open').click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Tofu naturel" }).waitFor();
    await dialog.getByText("Contains:").waitFor();
    await dialog.getByText("Voedingswaarde").click();
    await dialog.locator("table.nutrition").first().waitFor();
    const before = await amount(page.locator('.receipt .line[data-product="s1004"] output'));
    await dialog.locator(".product-buy").getByRole("button", { name: /^(Add to basket|Add 1): Tofu naturel/ }).click();
    await page.locator('.receipt .line[data-product="s1004"] output').filter({ hasText: String(before + 1) }).waitFor();
    assert.match(page.url(), /product=s1004/);
    await shot(page, "04-product");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.doesNotMatch(page.url(), /product=/);
    clean(page);
    await page.context().close();
  });

  test("choosing a delivery time", async () => {
    const page = await openPage();
    await signIn(page);
    await page.locator(".receipt .slot-banner").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab").nth(1).click();
    await dialog.locator(".slot:not([disabled])").first().click();
    await dialog.waitFor({ state: "detached" });
    await page.locator(".receipt .slot-banner strong").filter({ hasNotText: "Kies je bezorgmoment" }).waitFor();
    clean(page);
    await page.context().close();
  });

  test("recipes: price on the card, portions, unticking, swapping, adding as a recipe", async () => {
    const page = await openPage();
    await signIn(page);
    await page.getByRole("link", { name: "Cooking" }).click();
    const card = page.locator('.recipe-card[data-recipe="64a000000000000000000001"]');
    await card.locator(".card-price").filter({ hasText: "€" }).waitFor();
    await shot(page, "05-cookbook");
    await card.getByRole("link").click();
    await page.getByRole("heading", { name: "Rode linzencurry met spinazie" }).waitFor();
    // Untick the rice, three people.
    await page.locator('.ingredient[data-product="s1025"] input[type="checkbox"]').uncheck();
    await page.getByRole("button", { name: "Add 1: People" }).click();
    await page.locator(".portions output").filter({ hasText: "3" }).waitFor();
    await page.locator(".recipe-body:not(.refreshing)").waitFor();
    // Swap the onion for garlic.
    await page.getByRole("button", { name: "Change ingredient: Rode ui" }).click();
    const editor = page.getByRole("dialog");
    await editor.getByRole("button", { name: /Knoflook/ }).click();
    await editor.getByRole("button", { name: "Save" }).click();
    await editor.waitFor({ state: "detached" });
    await page.locator('.ingredient[data-product="s1016"]').waitFor();
    await shot(page, "06-recipe");
    await page.getByRole("button", { name: /Add to basket \(5\)/ }).click();
    await page.locator(".receipt .line-group-head").filter({ hasText: "Rode linzencurry" }).waitFor();
    assert.equal(await page.locator('.receipt .line[data-product="s1025"]').count(), 0, "the unticked rice stays out");
    clean(page);
    await page.context().close();
  });

  test("a meal plan and its shopping list", async () => {
    const page = await openPage();
    await signIn(page);
    await page.getByRole("link", { name: "Cooking" }).click();
    await page.locator(".recipe-card").first().waitFor();
    await page.locator('.planner input[type="number"]').first().fill("2");
    await page.getByRole("button", { name: "Make a plan" }).click();
    await page.getByRole("button", { name: "Show shopping list" }).click();
    const list = page.getByRole("dialog");
    await list.getByText("packages saved").waitFor();
    await list.getByRole("button", { name: "Add everything to the basket" }).click();
    await list.getByRole("button", { name: "Added!" }).waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".receipt .line-group").first().waitFor();
    clean(page);
    await page.context().close();
  });

  test("checking out: age check, paying in a new tab, the order confirmed", async () => {
    const page = await openPage();
    await signIn(page);
    await page.locator("#q").fill("koffie");
    await page.locator("#q").press("Enter");
    const coffee = page.locator('.cell[data-product="s1024"]');
    await coffee.getByRole("button", { name: /Add to basket/ }).click();
    for (let i = 0; i < 3; i++) await coffee.getByRole("button", { name: /^Add 1/ }).click();
    await page.locator('.receipt .line[data-product="s1024"] output').filter({ hasText: "4" }).waitFor();
    await page.getByRole("button", { name: "Check out" }).click();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    const age = page.getByRole("dialog");
    await age.getByText("18").first().waitFor();
    await age.getByRole("button", { name: "Confirm" }).click();
    await shot(page, "07-checkout");
    const [tab] = await Promise.all([page.context().waitForEvent("page"), page.getByRole("button", { name: "Pay at the bank" }).click()]);
    await tab.waitForLoadState().catch(() => {});
    await page.getByText("Status: PENDING").or(page.getByText("Status: FINISHED")).waitFor();
    await page.waitForURL(/#\/deliveries/, { timeout: 15000 });
    await page.getByText("Order placed").waitFor();
    assert.equal(await page.locator(".receipt-empty").count(), 1, "the basket is empty after ordering");
    await tab.close();
    clean(page);
    await page.context().close();
  });

  test("orders: tracking, rating, cancelling, parcels", async () => {
    const page = await openPage();
    await signIn(page);
    await page.getByRole("link", { name: "Orders" }).click();
    await page.getByText("Follow live").waitFor();
    await page.locator('a[href*="demo-delivery-current"]').click();
    await page.locator("svg.route").waitFor();
    await page.getByText("Expected arrival").waitFor();
    await shot(page, "08-tracking");
    await page.getByRole("button", { name: "Cancel the order" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
    await page.getByText("The order is cancelled.").waitFor();
    await page.goto(`${base}#/deliveries/demo-delivery-1`);
    await page.getByRole("radio", { name: "9" }).click();
    await page.getByRole("button", { name: "Send rating" }).click();
    await page.getByText("Thank you for your rating!").waitFor();
    await page.getByRole("button", { name: "Put these in the basket again" }).click();
    await page.locator('.receipt .line[data-product="s1013"]').waitFor();
    await page.goto(`${base}#/parcels`);
    await page.getByText("DHL-pakket").click();
    await page.getByText("Jouw pakketje").waitFor();
    clean(page);
    await page.context().close();
  });

  test("a pasted list, bought before, and the self-check", async () => {
    const page = await openPage();
    await signIn(page);
    await page.getByRole("link", { name: "Paste a list" }).click();
    await page.request.delete(`${base}api/cart`, { headers: { "x-desk-base": base } });
    await page.reload();
    await page.locator(".views").waitFor();
    await page.locator("#list-text").fill("2 appels\ntofu\nonbekend product xyz");
    await page.getByRole("button", { name: "Find these products" }).click();
    await page.locator(".list-row").first().getByRole("button", { name: /Add 2×/ }).click();
    await page.locator('.receipt .line[data-product="s1012"] output').filter({ hasText: "2" }).waitFor();
    await page.getByText("No results for “onbekend product xyz”").waitFor();
    await page.getByRole("link", { name: "Bought before" }).click();
    await page.locator(".past-item").first().waitFor();
    await page.getByRole("link", { name: "Account" }).click();
    await page.getByRole("button", { name: "Run the check" }).click();
    await page.getByText("Everything works.").waitFor();
    await shot(page, "09-account");
    clean(page);
    await page.context().close();
  });

  test("on a narrow screen the basket is a page of its own", async () => {
    const page = await openPage({ width: 820, height: 1000 });
    await signIn(page);
    assert.equal(await page.locator(".till").isVisible(), false);
    await page.locator(".nav-basket").click();
    await page.locator(".receipt-full").waitFor();
    await shot(page, "10-narrow-basket");
    clean(page);
    await page.context().close();
  });

  test("dark mode and keyboard: / jumps to the search box", async () => {
    const page = await openPage({ colorScheme: "dark" });
    await signIn(page);
    await page.locator("body").click({ position: { x: 5, y: 600 } });
    await page.keyboard.press("/");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "q");
    // Enter moves into the results; + adds, the arrows move, s stars.
    await page.keyboard.type("tofu");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.closest(".cell")?.getAttribute("data-product") === "s1004");
    const before = await amount(page.locator('.cell[data-product="s1004"] output'));
    await page.keyboard.press("+");
    await page.locator('.cell[data-product="s1004"] output').filter({ hasText: String(before + 1) }).waitFor();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => document.activeElement?.closest(".cell")?.getAttribute("data-product")), "s1005");
    await page.keyboard.press("s");
    await page.locator('.cell[data-product="s1005"] .star-on').waitFor();
    await shot(page, "11-dark");
    clean(page);
    await page.context().close();
  });
});
