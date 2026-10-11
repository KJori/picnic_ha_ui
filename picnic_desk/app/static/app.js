/* Picnic Desk front end. No build step, no dependencies.
   Every request URL is relative so the page works behind Home Assistant ingress. */
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const plain = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (cents) => euro.format(cents / 100);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });

  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/></svg>';

  const state = {
    view: "search",
    qty: new Map(),      // product id -> units, updated the moment you click
    cart: null,          // last basket Picnic confirmed
    known: new Map(),    // product id -> product, for lines Picnic has not confirmed yet
    saved: new Map(),
    history: null,
    fresh: null,         // id of the line to flash on the receipt
  };

  class SignedOut extends Error {}

  // ------------------------------------------------------------------ plumbing

  async function api(path, body) {
    const options = body === undefined
      ? {}
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    let response;
    try {
      response = await fetch(path, options);
    } catch {
      throw new Error("Picnic Desk is not reachable. Check that the add-on is running.");
    }
    let data = {};
    try { data = await response.json(); } catch { /* not JSON */ }
    if (response.status === 401 && data.signed_out) {
      showDoor({ needs_code: false });
      throw new SignedOut();
    }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  let noticeTimer;
  function say(text, isError = false) {
    const notice = $("#notice");
    notice.textContent = text;
    notice.classList.toggle("error", isError);
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, isError ? 8000 : 3500);
  }
  const fail = (err) => { if (!(err instanceof SignedOut)) say(err.message, true); };

  // --------------------------------------------------------------------- basket

  const pending = new Map(); // product id -> units still to send
  let flushTimer;
  let flushing = false;

  function change(product, delta) {
    const have = state.qty.get(product.id) || 0;
    const next = Math.max(0, Math.min(product.max || 99, have + delta));
    if (next === have) return;
    const merged = { ...state.known.get(product.id) };
    for (const [key, value] of Object.entries(product)) if (value != null) merged[key] = value;
    state.known.set(product.id, merged);
    state.qty.set(product.id, next);
    state.fresh = product.id;
    pending.set(product.id, (pending.get(product.id) || 0) + next - have);
    syncProduct(product.id);
    renderReceipt();
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 250);
  }

  async function flush() {
    if (flushing) return;
    flushing = true;
    let failed = false;
    while (pending.size) {
      const [id, delta] = pending.entries().next().value;
      pending.delete(id);
      if (!delta) continue;
      try {
        state.cart = await api("api/cart/change", { id, delta });
      } catch (err) {
        fail(err);
        failed = true;
        pending.clear();
      }
    }
    flushing = false;
    if (failed) {
      try { state.cart = await api("api/cart"); } catch { return; }
    }
    adoptCart();
  }

  function adoptCart() {
    if (pending.size || !state.cart) return;
    const before = new Set(state.qty.keys());
    state.qty = new Map();
    for (const line of state.cart.lines) {
      state.qty.set(line.id, (state.qty.get(line.id) || 0) + line.qty);
      before.add(line.id);
    }
    before.forEach(syncProduct);
    renderReceipt();
  }

  async function loadCart() {
    try {
      state.cart = await api("api/cart");
      adoptCart();
    } catch (err) { fail(err); }
  }

  function unitPrice(id) {
    const line = state.cart && state.cart.lines.find((entry) => entry.id === id);
    if (line && line.total != null && line.qty) return line.total / line.qty;
    const product = state.known.get(id);
    return product && product.price != null ? product.price : null;
  }

  function receiptLines() {
    const lines = [];
    const seen = new Set();
    for (const line of (state.cart ? state.cart.lines : [])) {
      if (seen.has(line.id)) continue;
      seen.add(line.id);
      const qty = state.qty.get(line.id) || 0;
      if (!qty) continue;
      const settled = qty === line.qty && line.total != null;
      const price = unitPrice(line.id);
      lines.push({ ...line, qty, total: settled ? line.total : (price != null ? price * qty : null) });
    }
    for (const [id, qty] of state.qty) {
      if (seen.has(id) || !qty) continue;
      const product = state.known.get(id) || { id, name: id, unit: "" };
      const price = unitPrice(id);
      lines.push({ id, name: product.name, unit: product.unit, max: product.max, qty, total: price != null ? price * qty : null });
    }
    return lines;
  }

  function renderReceipt() {
    const lines = receiptLines();
    const list = $("#lines");
    list.replaceChildren(...lines.map((line) => {
      const item = el("li", "line");
      if (line.id === state.fresh) item.classList.add("fresh");
      item.dataset.id = line.id;
      const what = el("div", "what");
      const title = el("button", "name", line.name);
      title.type = "button";
      title.title = "Show description and ingredients";
      title.addEventListener("click", () => openProduct({ id: line.id, name: line.name, unit: line.unit, max: line.max, image: line.image }));
      what.append(title);
      const detail = [line.unit, line.recipe ? "for a recipe" : ""].filter(Boolean).join(", ");
      if (detail) what.append(el("span", "", detail));
      item.append(
        stepper({ id: line.id, name: line.name, unit: line.unit, max: line.max }),
        what,
        el("span", "cost", line.total != null ? plain.format(line.total / 100) : "…"),
      );
      return item;
    }));
    state.fresh = null;

    const count = lines.reduce((sum, line) => sum + line.qty, 0);
    const settled = !pending.size && state.cart;
    const total = settled
      ? state.cart.total
      : lines.reduce((sum, line) => sum + (line.total || 0), 0);
    $("#basket-count").textContent = count === 1 ? "1 item" : `${count} items`;
    $("#empty-basket").hidden = lines.length > 0;
    $("#clear").hidden = lines.length === 0;
    $("#total").textContent = plain.format(total / 100);

    const minimum = state.cart && state.cart.minimum;
    $("#minimum").hidden = !minimum;
    if (minimum) {
      const short = minimum - total;
      $("#minimum").classList.toggle("met", short <= 0);
      $("#minimum-bar").style.width = `${Math.min(100, Math.max(0, (total / minimum) * 100))}%`;
      $("#minimum-text").textContent = short > 0
        ? `${money(short)} to go to reach the ${money(minimum)} minimum order.`
        : `Above the ${money(minimum)} minimum order.`;
    }

    const slot = state.cart && state.cart.slot;
    $("#slot").hidden = !slot || !slot.start;
    if (slot && slot.start) {
      const start = new Date(slot.start);
      let text = `Delivery slot in the basket: ${day.format(start)}, ${clock.format(start)}`;
      if (slot.end) text += ` to ${clock.format(new Date(slot.end))}`;
      text += ".";
      if (slot.cut_off) {
        const cut = new Date(slot.cut_off);
        text += ` Order by ${weekday.format(cut)} ${clock.format(cut)}.`;
      }
      $("#slot").textContent = text;
    }
  }

  // ------------------------------------------------------------------- products

  function stepper(product, want = 1) {
    const box = el("div", "stepper");
    box.dataset.stepper = product.id;
    const less = el("button", "less", "−");
    less.type = "button";
    less.setAttribute("aria-label", `One fewer ${product.name}`);
    const count = el("output");
    const more = el("button", "more", "+");
    more.type = "button";
    less.addEventListener("click", (event) => { event.stopPropagation(); change(product, -1); });
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      change(product, (state.qty.get(product.id) || 0) === 0 ? want : 1);
    });
    box.append(less, count, more);
    box.product = product;
    box.want = want;
    paintStepper(box);
    return box;
  }

  function paintStepper(box) {
    const { product, want } = box;
    const qty = state.qty.get(product.id) || 0;
    box.classList.toggle("empty", qty === 0);
    $("output", box).textContent = qty;
    $(".more", box).setAttribute(
      "aria-label",
      qty === 0 ? `Add ${want > 1 ? `${want} × ` : ""}${product.name} to the basket` : `One more ${product.name}`,
    );
  }

  /** Bring every tile and stepper for this product in line with state.qty. */
  function syncProduct(id) {
    const qty = state.qty.get(id) || 0;
    for (const box of $$(`[data-stepper="${CSS.escape(id)}"]`)) paintStepper(box);
    for (const tile of $$(`.product[data-id="${CSS.escape(id)}"]`)) {
      tile.classList.toggle("in-basket", qty > 0);
    }
    for (const row of $$(".wanted")) {
      row.classList.toggle("done", $$(".product.in-basket", row).length > 0);
    }
  }

  function tile(product, { note, want = 1 } = {}) {
    const item = el("li", "product");
    item.dataset.id = product.id;
    item.tabIndex = 0;
    if ((state.qty.get(product.id) || 0) > 0) item.classList.add("in-basket");

    const picture = el("div", "picture");
    if (product.image) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = "";
      img.src = `api/image/${encodeURIComponent(product.image)}`;
      img.addEventListener("error", () => { picture.textContent = product.name.charAt(0).toUpperCase(); });
      picture.append(img);
    } else {
      picture.textContent = product.name.charAt(0).toUpperCase();
    }

    const name = el("h3", "name", product.name);
    const meta = el("p", "meta");
    for (const label of product.labels || []) meta.append(el("span", "offer", label));
    const tiers = (product.tiers || []).map((tier) => `${money(tier.price)} each from ${tier.from}`);
    meta.append([product.unit, product.base_price, ...tiers, note].filter(Boolean).join(", "));

    const star = el("button", "star");
    star.type = "button";
    star.innerHTML = STAR;
    star.dataset.star = product.id;
    paintStar(star, product);
    star.addEventListener("click", () => toggleSaved(product));

    const buy = el("div", "buy");
    if (product.unavailable) {
      buy.append(el("span", "gone", product.unavailable));
    } else {
      const price = el("span", "price");
      if (product.price == null) {
        price.classList.add("unknown");
        price.textContent = "Price shows in the basket";
      } else {
        price.textContent = money(product.price);
      }
      buy.append(price, stepper(product, want));
    }

    item.append(picture, name, meta, buy, star);
    item.addEventListener("keydown", (event) => tileKeys(event, item, product, want));
    item.addEventListener("click", (event) => {
      if (!event.target.closest("button")) openProduct(product);
    });
    return item;
  }

  function tileKeys(event, item, product, want) {
    if (event.target !== item || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (key === "Enter" || key === "i") {
      openProduct(product);
    } else if ((key === "+" || key === "=") && !product.unavailable) {
      change(product, (state.qty.get(product.id) || 0) === 0 ? want : 1);
    } else if (key === "-" || key === "_") {
      change(product, -1);
    } else if (key === "s") {
      toggleSaved(product);
    } else if (key.startsWith("Arrow")) {
      const tiles = $$(".product", item.parentElement);
      const index = tiles.indexOf(item);
      const columns = tiles.filter((other) => other.offsetTop === tiles[0].offsetTop).length || 1;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[key];
      const target = tiles[index + step];
      if (target) target.focus();
    } else {
      return;
    }
    event.preventDefault();
  }

  function grid(products, options = () => ({})) {
    const list = el("ul", "products");
    list.append(...products.map((product) => tile(product, options(product))));
    return list;
  }

  // -------------------------------------------------------------- product page

  const sheet = $("#product");

  /** Picnic's text as nodes: **bold** becomes <strong>, line breaks are kept. */
  function rich(text) {
    const fragment = document.createDocumentFragment();
    String(text).split("\n").forEach((line, index) => {
      if (index) fragment.append(document.createElement("br"));
      line.split(/\*\*(.+?)\*\*/g).forEach((part, at) => {
        if (part) fragment.append(at % 2 ? el("strong", "", part) : part);
      });
    });
    return fragment;
  }

  function productPicture(ref, className) {
    const box = el("div", className);
    if (ref) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = `api/image/${ref}`;
      img.addEventListener("error", () => img.remove());
      box.append(img);
    }
    return box;
  }

  function renderProduct(product, info, problem) {
    const close = el("button", "quiet close", "Close");
    close.type = "button";
    close.addEventListener("click", () => sheet.close());

    const images = info && info.images.length ? info.images : (product.image ? [product.image] : []);
    const gallery = el("div", "gallery");
    const main = productPicture(images[0], "picture");
    gallery.append(main);
    if (images.length > 1) {
      const thumbs = el("div", "thumbs");
      images.forEach((ref, index) => {
        const thumb = el("button", "thumb");
        thumb.type = "button";
        thumb.setAttribute("aria-label", `Picture ${index + 1} of ${images.length}`);
        thumb.setAttribute("aria-pressed", String(index === 0));
        thumb.append(productPicture(ref, "picture"));
        thumb.addEventListener("click", () => {
          gallery.firstChild.replaceWith(productPicture(ref, "picture"));
          for (const other of $$(".thumb", thumbs)) other.setAttribute("aria-pressed", String(other === thumb));
        });
        thumbs.append(thumb);
      });
      gallery.append(thumbs);
    }

    const words = el("div", "words");
    const name = (info && info.name) || product.name || "";
    const brand = info && info.brand && !name.startsWith(info.brand) ? info.brand : "";
    if (brand) words.append(el("p", "brand", brand));
    const heading = el("h2", "", name);
    heading.id = "product-name";
    words.append(heading);
    const unit = (info && info.unit) || product.unit || "";
    const perUnit = info && info.price_per_unit;
    if (unit || perUnit) words.append(el("p", "hint", [unit, perUnit].filter(Boolean).join(", ")));

    const price = info && info.price != null ? info.price : product.price;
    const buy = el("div", "buy");
    const pricing = el("span", "pricing");
    if (price != null) pricing.append(el("span", "price", money(price)));
    if (info && info.was != null && info.was > price) {
      const was = el("s", "", money(info.was));
      was.setAttribute("aria-label", `was ${money(info.was)}`);
      pricing.append(was);
    }
    buy.append(pricing);
    if (!product.unavailable) buy.append(stepper({ max: 99, ...product, name }));
    else buy.append(el("span", "gone", product.unavailable));
    words.append(buy);
    if (info && info.multipack) words.append(el("p", "hint", "Multipack: Picnic shows the price per piece here. The basket shows what the pack costs."));
    if (info && info.highlights.length) {
      const list = el("ul", "highlights");
      for (const text of info.highlights) { const item = el("li"); item.append(rich(text)); list.append(item); }
      words.append(list);
    }

    const head = el("div", "sheet-head");
    head.append(gallery, words);
    const nodes = [close, head];

    if (problem) {
      const note = el("p", "hint", `${problem} `);
      const link = el("a", "quiet", "Download what Picnic sent");
      link.href = `api/raw-page/product-details-page-root?product=${encodeURIComponent(product.id)}`;
      link.download = "";
      note.append(link, " to help get it fixed.");
      nodes.push(note);
    } else if (!info) {
      nodes.push(el("p", "hint", "Fetching the description and ingredients."));
    } else {
      if (info.description) {
        const text = el("p", "description");
        text.append(rich(info.description));
        nodes.push(text);
      }
      if (info.allergens.length) {
        const box = el("p", "allergens");
        info.allergens.forEach((group, index) => {
          if (index) box.append(document.createElement("br"));
          box.append(el("b", "", `${group.label || "Allergens"}: `), group.items.join(", "));
        });
        nodes.push(box);
      }
      info.sections.forEach((section, index) => {
        const fold = el("details", "fold");
        fold.open = index === 0;
        const body = el("div");
        body.append(rich(section.text));
        fold.append(el("summary", "", section.title), body);
        nodes.push(fold);
      });
      if (!info.description && !info.sections.length && !info.allergens.length) {
        const note = el("p", "hint", "Picnic's page for this product came without a description or ingredients this add-on can read. ");
        const link = el("a", "quiet", "Download what Picnic sent");
        link.href = `api/raw-page/product-details-page-root?product=${encodeURIComponent(product.id)}`;
        link.download = "";
        note.append(link, " to help get it fixed.");
        nodes.push(note);
      } else if (!info.sections.length) {
        nodes.push(el("p", "hint", "Picnic lists no ingredients for this product."));
      }
    }
    sheet.replaceChildren(...nodes);
  }

  async function openProduct(product) {
    sheet.dataset.id = product.id;
    renderProduct(product, null);
    if (!sheet.open) sheet.showModal();
    try {
      const info = await api(`api/products/${encodeURIComponent(product.id)}`);
      if (sheet.dataset.id !== product.id || !sheet.open) return;
      renderProduct(product, info);
    } catch (err) {
      if (err instanceof SignedOut) { sheet.close(); return; }
      if (sheet.dataset.id === product.id && sheet.open) renderProduct(product, null, err.message);
    }
  }

  sheet.addEventListener("click", (event) => { if (event.target === sheet) sheet.close(); });

  // ---------------------------------------------------------------------- saved

  function paintStar(button, product) {
    const on = state.saved.has(product.id);
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? `Remove ${product.name} from Saved` : `Save ${product.name}`);
    button.title = on ? "Remove from Saved" : "Save";
  }

  async function toggleSaved(product) {
    try {
      const data = await api("api/saved/toggle", {
        id: product.id, name: product.name, unit: product.unit, image: product.image, price: product.price,
      });
      state.saved = new Map(data.products.map((entry) => [entry.id, entry]));
      for (const button of $$(`[data-star="${CSS.escape(product.id)}"]`)) paintStar(button, product);
      if (state.view === "saved") renderSaved();
      say(state.saved.has(product.id) ? `Saved ${product.name}.` : `Removed ${product.name} from Saved.`);
    } catch (err) { fail(err); }
  }

  function renderSaved() {
    const view = $("#view-saved");
    const products = [...state.saved.values()];
    if (!products.length) {
      view.replaceChildren(el("p", "hint", "Nothing saved yet. Use the star on any product to keep it here for next week."));
      return;
    }
    view.replaceChildren(grid(products));
  }

  // --------------------------------------------------------------------- search

  let searchTimer;
  let searchRun = 0;

  function searchIdle() {
    const hint = el("p", "hint");
    hint.append(
      "Type to search, or pick a shortcut. Press ", el("strong", "", "/"), " to jump to the search box and ",
      el("strong", "", "Enter"), " to move into the results. Click a product, or press ",
      el("strong", "", "Enter"), " on it, for its description and ingredients. On a product, ",
      el("strong", "", "+"), " and ", el("strong", "", "−"), " change the amount, ",
      el("strong", "", "s"), " saves it, and the arrow keys move around. Separate words with a comma to search for several things at once.",
    );
    $("#search-results").replaceChildren(hint);
  }

  async function runSearch(text, focusFirst = false) {
    const box = $("#search-results");
    const terms = [...new Set(text.split(",").map((term) => term.trim()).filter((term) => term.length >= 2))];
    const run = ++searchRun;
    if (!terms.length) { searchIdle(); return; }
    show("search");
    const asked = terms.join(", ");
    if (!$(".products", box)) box.replaceChildren(el("p", "hint", `Searching for “${asked}”.`));
    const groups = [];
    const shown = new Set();
    try {
      for (const term of terms) {
        const data = await api(`api/search?q=${encodeURIComponent(term)}`);
        if (run !== searchRun) return;
        const products = data.products.filter((product) => !shown.has(product.id));
        products.forEach((product) => { shown.add(product.id); state.known.set(product.id, product); });
        groups.push({ term, products });
      }
    } catch (err) {
      if (run !== searchRun) return;
      fail(err);
      box.replaceChildren(el("p", "hint", "The search did not come back. Try again in a moment."));
      return;
    }
    if (!shown.size) {
      box.replaceChildren(el("p", "hint", `No products match “${asked}”. Check the spelling or try a broader word.`));
      return;
    }
    if (groups.length === 1) {
      box.replaceChildren(grid(groups[0].products));
    } else {
      box.replaceChildren(...groups.map(({ term, products }) => {
        const section = el("section", "group");
        section.append(
          el("h3", "", term),
          products.length ? grid(products) : el("p", "hint", "No products match this word."),
        );
        return section;
      }));
    }
    if (focusFirst) $(".product", box).focus();
  }

  // ------------------------------------------------------------------ shortcuts

  const shortcuts = { items: [], editing: false };

  async function saveShortcuts(items) {
    try {
      shortcuts.items = (await api("api/shortcuts", { shortcuts: items })).shortcuts;
      renderShortcuts();
    } catch (err) { fail(err); }
  }

  function renderShortcuts() {
    const chips = el("div", "chips");
    shortcuts.items.forEach((item, index) => {
      const chip = el("button", "chip", item.label);
      chip.type = "button";
      if (shortcuts.editing) {
        chip.classList.add("removable");
        chip.append(el("span", "", "×"));
        chip.setAttribute("aria-label", `Remove the shortcut ${item.label}`);
        chip.addEventListener("click", () => saveShortcuts(shortcuts.items.filter((_, at) => at !== index)));
      } else {
        chip.title = item.view ? "Open the recipes" : `Search for ${item.query}`;
        chip.addEventListener("click", () => {
          if (item.view === "recipes") { show("recipes"); return; }
          $("#q").value = item.query;
          clearTimeout(searchTimer);
          runSearch(item.query);
        });
      }
      chips.append(chip);
    });
    const toggle = el("button", "quiet", shortcuts.editing ? "Done" : "Edit shortcuts");
    toggle.type = "button";
    toggle.addEventListener("click", () => { shortcuts.editing = !shortcuts.editing; renderShortcuts(); });
    chips.append(toggle);

    const box = $("#shortcuts");
    box.replaceChildren(chips);
    if (!shortcuts.editing) return;

    const form = el("form", "shortcut-form");
    const label = document.createElement("input");
    label.placeholder = "Name, for example Ontbijt";
    label.maxLength = 40;
    label.required = true;
    label.setAttribute("aria-label", "Shortcut name");
    const query = document.createElement("input");
    query.placeholder = "Search words, for example muesli, yoghurt";
    query.maxLength = 120;
    query.required = true;
    query.setAttribute("aria-label", "Search words");
    const add = el("button", "secondary", "Add shortcut");
    add.type = "submit";
    const reset = el("button", "quiet", "Restore the defaults");
    reset.type = "button";
    reset.addEventListener("click", () => saveShortcuts(null));
    form.append(label, query, add, reset);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveShortcuts([...shortcuts.items, { label: label.value.trim(), query: query.value.trim() }]);
    });
    box.append(form, el("p", "hint", "Click a shortcut to remove it. A shortcut is a saved search; several words separated by commas are searched one after the other."));
    label.focus();
  }

  // -------------------------------------------------------------------- recipes

  const recipes = { data: null, segment: null, filter: "", open: null };
  let recipeRun = 0;
  let portionTimer;

  const rawLink = (path) => {
    const link = el("a", "quiet", "Download what Picnic sent");
    link.href = `api/raw-page/${path}`;
    link.download = "";
    return link;
  };

  function recipeTrouble(text, rawPath, back = false) {
    const note = el("p", "hint", `${text} `);
    note.append(rawLink(rawPath), " to help get it fixed. The file can contain your name and address.");
    const nodes = [note];
    if (back) {
      const button = el("button", "quiet", "Back to recipes");
      button.type = "button";
      button.addEventListener("click", renderRecipeList);
      nodes.unshift(button);
    }
    $("#view-recipes").replaceChildren(...nodes);
  }

  async function loadRecipes(category = null, refresh = false) {
    const run = ++recipeRun;
    recipes.open = null;
    $("#view-recipes").replaceChildren(el("p", "hint", "Fetching recipes from Picnic."));
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (refresh) params.set("refresh", "1");
    try {
      const data = await api(`api/recipes?${params}`);
      if (run !== recipeRun) return;
      recipes.data = data;
      recipes.segment = null;
      renderRecipeList();
    } catch (err) {
      if (run !== recipeRun || err instanceof SignedOut) return;
      fail(err);
      recipeTrouble("The recipes did not load.", category || "cookbook-page-content");
    }
  }

  function renderRecipeList() {
    const view = $("#view-recipes");
    const data = recipes.data;
    recipes.open = null;
    if (!data) { loadRecipes(); return; }

    const chips = el("div", "chips");
    const chip = (text, active, action) => {
      const button = el("button", "chip", text);
      button.type = "button";
      button.setAttribute("aria-pressed", String(active));
      button.addEventListener("click", action);
      chips.append(button);
    };
    chip("All", !data.category && !recipes.segment, () => {
      if (data.category) loadRecipes(); else { recipes.segment = null; renderRecipeList(); }
    });
    if (!data.category) {
      for (const segment of data.segments) {
        chip(segment.label, recipes.segment === segment.id, () => { recipes.segment = segment.id; renderRecipeList(); });
      }
    }
    for (const category of data.categories) {
      chip(category.label, data.category === category.id, () => loadRecipes(category.id));
    }

    const filter = document.createElement("input");
    filter.type = "search";
    filter.className = "recipe-filter";
    filter.placeholder = "Filter these recipes by name";
    filter.setAttribute("aria-label", "Filter these recipes by name");
    filter.value = recipes.filter;

    const list = el("ul", "recipes");
    const none = el("p", "hint", "No recipe here matches that name.");
    const paint = () => {
      const words = recipes.filter.toLowerCase().split(/\s+/).filter(Boolean);
      const visible = data.recipes.filter((recipe) => {
        if (recipes.segment && !recipe.segments.includes(recipes.segment)) return false;
        const name = (recipe.name || "").toLowerCase();
        return words.every((word) => name.includes(word));
      });
      list.replaceChildren(...visible.map(recipeCard));
      none.hidden = visible.length > 0;
    };
    filter.addEventListener("input", () => { recipes.filter = filter.value; paint(); });

    if (!data.recipes.length) {
      view.replaceChildren(chips);
      const note = el("p", "hint", "Picnic's recipe page came back without recipes this add-on can read. ");
      note.append(rawLink(data.category || "cookbook-page-content"), " to help get it fixed. The file can contain your name and address.");
      view.append(note);
      return;
    }
    paint();
    view.replaceChildren(chips, filter, list, none);
  }

  function recipeCard(recipe) {
    const item = el("li");
    const button = el("button", "recipe");
    button.type = "button";
    const picture = el("span", "picture");
    if (recipe.image) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = "";
      img.src = `api/image/${recipe.image}`;
      img.addEventListener("error", () => img.remove());
      picture.append(img);
    }
    const cost = el("span", "cost");
    button.append(picture, el("span", "name", recipe.name || "Recipe without a name"), cost);
    button.addEventListener("click", () => openRecipe(recipe.id));
    item.append(button);
    if (recipe.price_text) {
      cost.textContent = recipe.price_text;  // the price Picnic prints on the tile
    } else if (recipeCosts.has(recipe.id)) {
      paintCost(cost, recipeCosts.get(recipe.id));
    } else {
      cost.dataset.recipe = recipe.id;
      costWatcher.observe(cost);
    }
    return item;
  }

  // Price indications: one request per recipe, only for cards that are in view,
  // two at a time. The server remembers each answer for a day.
  const recipeCosts = new Map();
  const costQueue = [];
  let costsRunning = 0;

  function costText(cost) {
    if (!cost || cost.price == null) return "";
    const portions = cost.portions === 1 ? "1 portion" : `${cost.portions} portions`;
    return `${cost.complete ? "about" : "at least"} ${money(cost.price)} for ${portions}`;
  }

  function paintCost(node, cost) {
    node.textContent = costText(cost);
    if (cost && cost.price != null && cost.portions > 1) {
      node.title = `${money(Math.round(cost.price / cost.portions))} per portion, for the products Picnic adds by default`;
    }
  }

  function pumpCosts() {
    while (costsRunning < 2 && costQueue.length) {
      const node = costQueue.shift();
      const id = node.dataset.recipe;
      if (!node.isConnected) continue;
      if (recipeCosts.has(id)) { paintCost(node, recipeCosts.get(id)); continue; }
      costsRunning += 1;
      api(`api/recipes/${id}/price`)
        .then((cost) => { recipeCosts.set(id, cost); paintCost(node, cost); })
        .catch(() => { /* a missing indication is not worth an error message */ })
        .finally(() => { costsRunning -= 1; pumpCosts(); });
    }
  }

  const costWatcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      costWatcher.unobserve(entry.target);
      costQueue.push(entry.target);
    }
    pumpCosts();
  }, { rootMargin: "150px" });

  async function openRecipe(id, portions) {
    const run = ++recipeRun;
    const previous = recipes.open && recipes.open.id === id ? recipes.open : null;
    if (!previous) $("#view-recipes").replaceChildren(el("p", "hint", "Opening the recipe."));
    try {
      const data = await api(`api/recipes/${id}${portions ? `?portions=${portions}` : ""}`);
      if (run !== recipeRun) return;
      const ticked = new Set();
      for (const item of data.ingredients) {
        const before = previous && previous.ingredients.find((old) => old.id === item.id);
        const on = before ? previous.ticked.has(item.id) : item.checked;
        if (on && item.available) ticked.add(item.id);
      }
      recipes.open = { ...data, ticked };
      renderRecipe();
    } catch (err) {
      if (run !== recipeRun || err instanceof SignedOut) return;
      fail(err);
      if (previous) { renderRecipe(); return; }
      recipeTrouble("This recipe did not open.", `selling-group-details-page?recipe=${id}`, true);
    }
  }

  function renderRecipe() {
    const recipe = recipes.open;
    const view = $("#view-recipes");

    const back = el("button", "quiet", "Back to recipes");
    back.type = "button";
    back.addEventListener("click", renderRecipeList);

    const head = el("div", "recipe-head");
    const picture = el("div", "picture");
    if (recipe.image) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = `api/image/${recipe.image}`;
      img.addEventListener("error", () => img.remove());
      picture.append(img);
    }
    const words = el("div");
    words.append(el("h2", "", recipe.name));
    if (recipe.description) words.append(el("p", "hint", recipe.description));

    const portions = el("div", "portions");
    const fewer = el("button", "", "−");
    fewer.type = "button";
    fewer.setAttribute("aria-label", "Fewer portions");
    fewer.disabled = recipe.portions <= 1;
    const more = el("button", "", "+");
    more.type = "button";
    more.setAttribute("aria-label", "More portions");
    more.disabled = recipe.portions >= 24;
    const count = el("output", "", String(recipe.portions));
    const setPortions = (next) => {
      count.textContent = String(next);
      recipe.portions = next;
      fewer.disabled = next <= 1;
      more.disabled = next >= 24;
      clearTimeout(portionTimer);
      portionTimer = setTimeout(() => openRecipe(recipe.id, next), 400);
    };
    fewer.addEventListener("click", () => setPortions(recipe.portions - 1));
    more.addEventListener("click", () => setPortions(recipe.portions + 1));
    const box = el("span", "stepper");
    box.append(fewer, count, more);
    portions.append(el("span", "", "Portions"), box);
    words.append(portions);
    head.append(picture, words);

    const total = el("p", "recipe-total");
    const add = el("button", "primary");
    add.type = "button";
    const paintFoot = () => {
      const chosen = recipe.ingredients.filter((item) => recipe.ticked.has(item.id));
      const sum = chosen.reduce((cents, item) => cents + (item.price || 0) * item.qty, 0);
      const priced = chosen.every((item) => item.price != null);
      const each = recipe.portions > 1 ? `, ${money(Math.round(sum / recipe.portions))} per portion` : "";
      total.textContent = chosen.length ? `${priced ? "" : "At least "}${money(sum)} for what is ticked${each}` : "";
      add.textContent = chosen.length === 1 ? "Add 1 ingredient to the basket" : `Add ${chosen.length} ingredients to the basket`;
      add.disabled = chosen.length === 0;
    };

    const row = (item) => {
      const line = el("li");
      const label = el("label", "ingredient");
      const tick = document.createElement("input");
      tick.type = "checkbox";
      tick.checked = recipe.ticked.has(item.id);
      tick.disabled = !item.available;
      tick.addEventListener("change", () => {
        if (tick.checked) recipe.ticked.add(item.id); else recipe.ticked.delete(item.id);
        paintFoot();
      });
      const thumb = el("span", "picture");
      if (item.image) {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = "";
        img.src = `api/image/${item.image}`;
        img.addEventListener("error", () => img.remove());
        thumb.append(img);
      }
      const what = el("span", "what");
      what.append(el("b", "", item.name));
      if (!item.available) what.append(el("span", "gone", "Not available right now"));
      else if (item.unit) what.append(el("span", "", item.unit));
      const have = state.qty.get(item.id) || 0;
      if (have) what.append(el("span", "have", `${have} already in the basket`));
      const more = el("button", "quiet", "Description and ingredients");
      more.type = "button";
      more.addEventListener("click", (event) => {
        event.preventDefault();
        openProduct({ id: item.id, name: item.name, unit: item.unit, price: item.price, image: item.image });
      });
      what.append(more);
      label.append(
        tick, thumb, what,
        el("span", "times", `${item.qty} ×`),
        el("span", "price", item.price != null ? money(item.price * item.qty) : ""),
      );
      line.append(label);
      return line;
    };

    const usual = recipe.ingredients.filter((item) => item.checked);
    const cupboard = recipe.ingredients.filter((item) => !item.checked);
    const nodes = [back, head];
    if (usual.length) {
      const list = el("ul", "ingredients");
      list.append(...usual.map(row));
      nodes.push(el("h3", "", "Ingredients"), list);
    }
    if (cupboard.length) {
      const list = el("ul", "ingredients");
      list.append(...cupboard.map(row));
      nodes.push(el("h3", "", "Probably in your cupboard"), list);
    }

    add.addEventListener("click", async () => {
      add.disabled = true;
      add.textContent = "Adding to the basket";
      try {
        clearTimeout(flushTimer);
        await flush();
        const result = await api(`api/recipes/${recipe.id}/add`, {
          portions: recipe.portions, selected: [...recipe.ticked],
        });
        state.cart = result.cart;
        adoptCart();
        if (result.skipped.length) {
          const names = result.skipped.map((id) => (recipe.ingredients.find((item) => item.id === id) || {}).name || id);
          say(`Added ${result.added} of ${result.added + result.skipped.length}. Picnic could not add: ${names.join(", ")}.`, true);
        } else {
          say(`Added ${result.added === 1 ? "1 ingredient" : `${result.added} ingredients`} for ${result.name}.`);
        }
        if (recipes.open === recipe) renderRecipe();
      } catch (err) {
        fail(err);
        await loadCart();
        paintFoot();
      }
    });

    const foot = el("div", "recipe-foot");
    foot.append(total, add);
    paintFoot();
    view.replaceChildren(...nodes, foot);
  }

  // --------------------------------------------------------------- paste a list

  let listRun = 0;

  function parseList(text) {
    return text.split("\n")
      .map((line) => line.replace(/^\s*(?:[-*•]|\[\s?\])\s*/, "").trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d{1,2})(?:\s*[x×*]\s+|\s+)(.+)$/i);
        const want = match ? Math.max(1, Math.min(99, Number(match[1]))) : 1;
        return { term: match ? match[2].trim() : line, want };
      });
  }

  async function runList(text) {
    const wanted = parseList(text);
    const rows = $("#list-rows");
    const run = ++listRun;
    if (!wanted.length) { say("Type or paste at least one product first.", true); return; }
    $("#list-reset").hidden = false;
    const sections = wanted.map(({ term, want }) => {
      const section = el("section", "wanted");
      const heading = el("h3", "", term);
      if (want > 1) heading.append(el("small", "", `add ${want}`));
      section.append(heading, el("p", "hint", "Searching."));
      return section;
    });
    rows.replaceChildren(...sections);
    for (let index = 0; index < wanted.length; index += 1) {
      if (run !== listRun) return;
      const { term, want } = wanted[index];
      const section = sections[index];
      try {
        const data = await api(`api/search?q=${encodeURIComponent(term)}`);
        if (run !== listRun) return;
        const top = data.products.filter((product) => !product.unavailable).slice(0, 4);
        top.forEach((product) => state.known.set(product.id, product));
        section.lastChild.replaceWith(
          top.length
            ? grid(top, () => ({ want }))
            : el("p", "hint", "No match. Try this one in Search with a different word."),
        );
        section.classList.toggle("done", $$(".product.in-basket", section).length > 0);
      } catch (err) {
        if (err instanceof SignedOut) return;
        section.lastChild.replaceWith(el("p", "hint", `Could not search for this one: ${err.message}`));
      }
    }
  }

  // --------------------------------------------------------------- bought before

  async function renderHistory(refresh = false) {
    const view = $("#view-history");
    if (!state.history || refresh) {
      view.replaceChildren(el("p", "hint", "Reading your recent deliveries. This takes a few seconds the first time."));
      try {
        state.history = await api(`api/history${refresh ? "?refresh=1" : ""}`);
      } catch (err) {
        fail(err);
        view.replaceChildren(el("p", "hint", "Your deliveries did not load. Open this tab again to retry."));
        return;
      }
      state.history.products.forEach((product) => {
        if (!state.known.has(product.id)) state.known.set(product.id, product);
      });
    }
    const { products, deliveries } = state.history;
    if (!products.length) {
      view.replaceChildren(el("p", "hint", "No past deliveries found on this account yet."));
      return;
    }
    const bar = el("div", "view-bar");
    bar.append(el("p", "", `What you bought in your last ${deliveries === 1 ? "delivery" : `${deliveries} deliveries`}, most frequent first. Prices are what you paid then.`));
    const again = el("button", "quiet", "Read deliveries again");
    again.type = "button";
    again.addEventListener("click", () => renderHistory(true));
    bar.append(again);
    view.replaceChildren(bar, grid(products, (product) => ({
      note: deliveries > 1 ? `in ${product.times} of ${deliveries} orders` : "",
    })));
  }

  // ----------------------------------------------------------------- self-check

  async function runCheck() {
    const view = $("#view-check");
    show("check");
    view.replaceChildren(el("p", "hint", "Trying each part against Picnic. Nothing in your basket changes."));
    let data;
    try {
      data = await api("api/selfcheck");
    } catch (err) {
      fail(err);
      view.replaceChildren(el("p", "hint", "The check could not run. Try again in a moment."));
      return;
    }
    const list = el("ul", "checks");
    for (const check of data.checks) {
      const item = el("li", check.ok ? "works" : "broken");
      item.append(el("b", "", check.name), el("span", "verdict", check.ok ? "Works" : "Does not work"), el("p", "", check.detail));
      list.append(item);
    }
    const broken = data.checks.filter((check) => !check.ok).length;
    const summary = el("p", "hint", broken
      ? `${broken} of ${data.checks.length} parts do not work with Picnic right now.`
      : `All ${data.checks.length} parts that can be tried safely work.`);
    const rest = el("p", "hint", `Not tried, because they would change your basket: ${data.not_checked.join(", ").toLowerCase()}.`);
    view.replaceChildren(el("h2", "", "What works with Picnic"), summary, list, rest);
  }

  // ----------------------------------------------------------------------- views

  function show(view) {
    state.view = view;
    for (const button of $$(".views button")) {
      if (button.dataset.view === view) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    for (const section of $$(".view")) section.hidden = section.id !== `view-${view}`;
    if (view === "history") renderHistory();
    if (view === "saved") renderSaved();
    if (view === "recipes" && !recipes.open) renderRecipeList();
  }

  function showDoor(session) {
    $("#desk").hidden = true;
    $("#door").hidden = false;
    $("#signin").hidden = Boolean(session.needs_code);
    $("#codeform").hidden = !session.needs_code;
    (session.needs_code ? $("#code") : $("#email")).focus();
  }

  async function showDesk(session) {
    $("#door").hidden = true;
    $("#desk").hidden = false;
    $("#who").textContent = session.name ? `Signed in as ${session.name}.` : "";
    state.history = null;
    recipes.data = null;
    recipes.open = null;
    shortcuts.editing = false;
    searchIdle();
    show("search");
    renderReceipt();
    $("#q").focus();
    await loadCart();
    try {
      const data = await api("api/saved");
      state.saved = new Map(data.products.map((entry) => [entry.id, entry]));
      shortcuts.items = (await api("api/shortcuts")).shortcuts;
      renderShortcuts();
    } catch (err) { fail(err); }
  }

  const enter = (session) => (session.logged_in ? showDesk(session) : showDoor(session));

  // ---------------------------------------------------------------------- events

  $("#find").addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    runSearch($("#q").value, true);
  });
  $("#q").addEventListener("input", () => {
    clearTimeout(searchTimer);
    const term = $("#q").value;
    searchTimer = setTimeout(() => runSearch(term), 350);
  });

  for (const button of $$(".views button")) {
    button.addEventListener("click", () => show(button.dataset.view));
  }

  $("#paste").addEventListener("submit", (event) => {
    event.preventDefault();
    runList($("#list-text").value);
  });
  $("#list-reset").addEventListener("click", () => {
    listRun += 1;
    $("#list-text").value = "";
    $("#list-rows").replaceChildren();
    $("#list-reset").hidden = true;
    $("#list-text").focus();
  });

  let clearArmed;
  $("#clear").addEventListener("click", async () => {
    const button = $("#clear");
    if (!button.dataset.armed) {
      button.dataset.armed = "1";
      button.textContent = "Click again to empty it";
      clearArmed = setTimeout(() => { delete button.dataset.armed; button.textContent = "Empty the basket"; }, 4000);
      return;
    }
    clearTimeout(clearArmed);
    delete button.dataset.armed;
    button.textContent = "Empty the basket";
    try {
      pending.clear();
      state.cart = await api("api/cart/clear", {});
      adoptCart();
      say("Emptied the basket.");
    } catch (err) { fail(err); }
  });

  $("#check").addEventListener("click", runCheck);

  $("#logout").addEventListener("click", async () => {
    try { enter(await api("api/logout", {})); } catch (err) { fail(err); }
  });

  $("#signin").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#signin .primary");
    button.disabled = true;
    try {
      const session = await api("api/login", { email: $("#email").value, password: $("#password").value });
      $("#password").value = "";
      enter(session);
    } catch (err) { fail(err); }
    button.disabled = false;
  });

  for (const button of $$("[data-channel]")) {
    button.addEventListener("click", async () => {
      try {
        await api("api/code/send", { channel: button.dataset.channel });
        say(button.dataset.channel === "EMAIL" ? "Code sent by email." : "Code sent by text message.");
        $("#code").focus();
      } catch (err) { fail(err); }
    });
  }
  $("#codeform").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const session = await api("api/code/verify", { code: $("#code").value });
      $("#code").value = "";
      enter(session);
    } catch (err) { fail(err); }
  });
  $("#code-back").addEventListener("click", async () => {
    try { enter(await api("api/logout", {})); } catch (err) { fail(err); }
  });

  document.addEventListener("keydown", (event) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(event.target.tagName);
    if (event.key === "/" && !typing && !$("#desk").hidden && !sheet.open) {
      event.preventDefault();
      $("#q").focus();
      $("#q").select();
    } else if (event.key === "Escape" && event.target === $("#q")) {
      $("#q").value = "";
      runSearch("");
    }
  });

  // The basket may have changed in the Picnic app while this tab was in the background.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !$("#desk").hidden && !pending.size && !flushing) loadCart();
  });

  (async () => {
    try {
      const session = await api("api/state");
      $("#demo").hidden = !session.demo;
      enter(session);
    } catch (err) {
      $("#door").hidden = false;
      $("#signin").hidden = true;
      fail(err);
    }
  })();
})();
