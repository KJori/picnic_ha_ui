// Accessibility checks for the browser tests, on what Chromium itself
// computes (no checker library can be installed here):
//
// - every control has an accessible name (Chromium's accessibility tree)
// - text contrast is at least WCAG AA: 4.5:1, or 3:1 for large text
// - buttons are at least 24 × 24 px (WCAG 2.2, 2.5.8)
// - one main landmark, and headings that do not skip a level
// - the element that has keyboard focus shows it
//
// Each check returns a list of problems; an empty list passes.

const NAMED_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
  "tab",
  "menuitem",
  "option",
  "listbox",
  "img",
  "dialog",
]);

/** Controls Chromium exposes without a name. */
export async function unnamedControls(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const problems = [];
    for (const node of nodes) {
      if (node.ignored) continue;
      const role = node.role?.value;
      if (!NAMED_ROLES.has(role)) continue;
      const name = String(node.name?.value ?? "").trim();
      if (name) continue;
      let where = "";
      if (node.backendDOMNodeId) {
        const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: node.backendDOMNodeId });
        const { result } = await cdp.send("Runtime.callFunctionOn", {
          objectId: object.objectId,
          functionDeclaration: "function () { return this.outerHTML ? this.outerHTML.slice(0, 160) : this.nodeName; }",
          returnByValue: true,
        });
        where = result.value;
      }
      problems.push(`${role} without a name: ${where}`);
    }
    return problems;
  } finally {
    await cdp.detach();
  }
}

/** Text whose contrast with what is behind it is below WCAG AA. */
export async function lowContrast(page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    /** Any CSS colour as sRGB 0..255 plus alpha 0..1, by painting it. */
    const rgba = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return a === 0 ? [0, 0, 0, 0] : [r, g, b, a / 255];
    };
    const over = (top, bottom) => {
      const a = top[3];
      return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
    };
    const luminance = ([r, g, b]) => {
      const lin = (v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const canvasColour = rgba(getComputedStyle(document.documentElement).backgroundColor);
    const page = canvasColour[3] ? canvasColour : rgba(matchMedia("(prefers-color-scheme: dark)").matches ? "#121212" : "#ffffff");
    /** What is painted behind an element: its own and its ancestors' backgrounds, blended. */
    const behind = (element) => {
      const layers = [];
      for (let el = element; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (style.backgroundImage !== "none") return null; // a picture behind: cannot tell
        const colour = rgba(style.backgroundColor);
        if (colour[3] > 0) layers.push(colour);
        if (colour[3] === 1) break;
      }
      return layers.reduceRight((below, layer) => over(layer, below), page);
    };
    const problems = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!text.textContent.trim()) continue;
      const element = text.parentElement;
      if (!element || element.closest("[hidden], [aria-hidden='true'], .visually-hidden")) continue;
      if (element.closest(":disabled, [aria-disabled='true']")) continue; // WCAG leaves these out
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const background = behind(element);
      if (!background) continue;
      const foreground = over(rgba(style.color), background);
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const needed = large ? 3 : 4.5;
      const found = ratio(foreground, background);
      if (found + 0.005 < needed) {
        const label = `${element.tagName.toLowerCase()}${element.className && typeof element.className === "string" ? `.${element.className.trim().split(/\s+/).join(".")}` : ""}`;
        const key = `${label} ${style.color} on rgb(${background.slice(0, 3).map(Math.round).join(",")})`;
        if (!problems.has(key)) problems.set(key, `${key}: ${found.toFixed(2)}:1, needs ${needed}:1 ("${text.textContent.trim().slice(0, 40)}")`);
      }
    }
    return [...problems.values()];
  });
}

/** Buttons smaller than 24 × 24 px. A box inside its label is clicked anywhere on the label, so that counts. */
export async function smallTargets(page) {
  return page.evaluate(() => {
    const problems = [];
    for (const el of document.querySelectorAll("button, [role='button'], input[type='checkbox'], input[type='radio'], select")) {
      const target = (el.matches("input") && el.closest("label")) || el;
      const box = target.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (el.closest("[hidden], [aria-hidden='true']")) continue;
      if (box.width < 24 || box.height < 24) {
        problems.push(`${el.outerHTML.slice(0, 120)} is ${Math.round(box.width)} × ${Math.round(box.height)} px`);
      }
    }
    return problems;
  });
}

/** One main landmark, and no heading that skips a level. */
export async function structure(page) {
  return page.evaluate(() => {
    const problems = [];
    const mains = document.querySelectorAll("main, [role='main']");
    if (mains.length !== 1) problems.push(`${mains.length} main landmarks`);
    const open = document.querySelector("dialog[open]");
    const scope = open ?? document.body;
    let last = 0;
    for (const h of scope.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      if (!open && h.closest("dialog")) continue;
      const level = Number(h.tagName[1]);
      if (last && level > last + 1) problems.push(`heading ${h.tagName} "${h.textContent.trim().slice(0, 40)}" after h${last}`);
      last = level;
    }
    return problems;
  });
}

/** Press Tab `steps` times; every element that gets focus must show it. */
export async function focusShows(page, steps = 30) {
  const problems = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    const finding = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
      const ring = style.boxShadow && style.boxShadow !== "none";
      return outline || ring ? null : el.outerHTML.slice(0, 120);
    });
    if (finding) problems.push(`focus not visible on ${finding}`);
  }
  return [...new Set(problems)];
}

/** All checks for the screen as it is now. */
export async function audit(page, { focus = false } = {}) {
  const problems = [
    ...(await unnamedControls(page)),
    ...(await lowContrast(page)),
    ...(await smallTargets(page)),
    ...(await structure(page)),
  ];
  if (focus) problems.push(...(await focusShows(page)));
  return problems;
}
