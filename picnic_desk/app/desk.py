"""Thread-safe wrapper around python-picnic-api2 that hands plain dicts to the UI.

Everything Picnic-specific lives here: login (with 2FA), token storage, search,
basket changes, the "bought before" list built from past deliveries, saved
products, search shortcuts and recipes. The web layer in server.py only
translates HTTP to these calls.

Search, basket and deliveries go through the library's own methods. Recipes are
not covered by the library, so those requests are made here (see the recipes
section) using endpoints documented by two other open-source clients.

The password is never stored. After a successful login only the session token
is written to the data directory (mode 600).
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import warnings
from collections import OrderedDict
from contextlib import contextmanager
from functools import partial
from pathlib import Path

from python_picnic_api2 import (
    Picnic2FAError,
    Picnic2FARequired,
    PicnicAPI,
    PicnicAuthError,
)
from python_picnic_api2 import client as picnic_client
from python_picnic_api2.models import Cart

import recipes as recipe_pages

IMAGE_URL = (
    "https://storefront-prod.{cc}.picnicinternational.com/static/images/{id}/{size}.png"
)
IMAGE_REF = re.compile(r"^(?:[a-z][a-z0-9_-]{1,30}/)?[A-Za-z0-9_-]{8,128}$")
RECIPE_ID = re.compile(r"^[a-f0-9]{24,32}$")
PAGE_ID = re.compile(r"^[A-Za-z0-9_-]{3,80}$")
# The app version the recipe pages were checked against by MRVDH/picnic-api.
# The library's own (older) version string is tried second.
PAGE_AGENT = "30100;1.246.1-15599;"
RECIPE_LIST_MAX_AGE = 600
RECIPE_NAME_LOOKUPS = 20
MAX_SHORTCUTS = 24
RECIPES_VIEW = "recipes"
DEFAULT_SHORTCUTS = {
    "NL": [("Brood", "brood"), ("Vegan producten", "vegan, plantaardig"), ("Groente", "groente"),
           ("Fruit", "fruit"), ("Pasta en rijst", "pasta, rijst"), ("Gerechten", None)],
    "DE": [("Brot", "brot"), ("Vegane Produkte", "vegan, pflanzlich"), ("Gemüse", "gemüse"),
           ("Obst", "obst"), ("Nudeln und Reis", "nudeln, reis"), ("Rezepte", None)],
    "FR": [("Pain", "pain"), ("Produits vegan", "vegan, végétal"), ("Légumes", "légumes"),
           ("Fruits", "fruits"), ("Pâtes et riz", "pâtes, riz"), ("Recettes", None)],
}
REQUEST_TIMEOUT = 20  # seconds; the library itself sets none
HISTORY_DELIVERIES = 10  # how many past deliveries feed "Bought before"
HISTORY_MAX_AGE = 12 * 3600
SEARCH_LIMIT = 60
IMAGE_CACHE_ITEMS = 500


class NotLoggedIn(Exception):
    """No valid Picnic session; the UI should show the sign-in form."""


class DeskError(Exception):
    """A user-facing error with a plain-language message."""


class Desk:
    def __init__(self, data_dir: str, country: str = "NL", api_class=PicnicAPI):
        self.dir = Path(data_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.country = (country or "NL").upper()
        self._api_class = api_class
        self._lock = threading.RLock()
        self._images: OrderedDict[str, bytes] = OrderedDict()
        self._image_lock = threading.Lock()
        self.pending_2fa = False
        self.api = None
        self.user_name = None
        self._recipe_lists: dict = {}  # category -> (time, parsed list)

        self._stored_token = self._read("auth.json", {}).get("token")
        if self._stored_token:
            self.api = self._new_api(self._stored_token)

    # ---------------------------------------------------------------- storage

    def _read(self, name: str, default):
        try:
            return json.loads((self.dir / name).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return default

    def _write(self, name: str, value, private: bool = False):
        path = self.dir / name
        tmp = path.with_suffix(path.suffix + ".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600 if private else 0o644)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(value, fh, ensure_ascii=False)
        os.replace(tmp, path)

    def _remove(self, name: str):
        try:
            (self.dir / name).unlink()
        except OSError:
            pass

    # ---------------------------------------------------------------- session

    def _new_api(self, token: str | None = None):
        api = self._api_class(country_code=self.country, auth_token=token)
        # requests.Session.get/post funnel through .request; give it a timeout.
        api.session.request = partial(api.session.request, timeout=REQUEST_TIMEOUT)
        return api

    def _save_token(self):
        token = self.api.session.auth_token if self.api else None
        if token and token != self._stored_token:
            self._write("auth.json", {"token": token}, private=True)
            self._stored_token = token

    def _forget(self):
        self.api = None
        self.pending_2fa = False
        self.user_name = None
        self._stored_token = None
        self._recipe_lists = {}
        self._remove("auth.json")

    def _call(self, fn):
        """Run fn(api) under the lock, mapping auth failures to NotLoggedIn."""
        with self._lock:
            if self.api is None or self.pending_2fa or not self.api.logged_in():
                raise NotLoggedIn()
            try:
                return fn(self.api)
            except PicnicAuthError:
                self._forget()
                raise NotLoggedIn() from None
            finally:
                if self.api is not None:
                    self._save_token()

    def state(self) -> dict:
        with self._lock:
            logged_in = bool(self.api and self.api.logged_in() and not self.pending_2fa)
            if logged_in and self.user_name is None:
                try:
                    user = self._call(lambda api: api.get_user())
                    self.user_name = user.firstname or ""
                except NotLoggedIn:
                    logged_in = False
                except Exception:  # offline etc.: still show the UI
                    self.user_name = ""
            return {
                "logged_in": logged_in,
                "needs_code": self.pending_2fa,
                "name": self.user_name or "",
                "country": self.country,
            }

    def login(self, email: str, password: str) -> dict:
        if not email or not password:
            raise DeskError("Enter your Picnic email address and password.")
        with self._lock:
            self._forget()
            api = self._new_api()
            try:
                api.login(email, password)
            except Picnic2FARequired:
                self.api = api
                self.pending_2fa = True
                return self.state()
            except PicnicAuthError:
                raise DeskError(
                    "Picnic did not accept that email address and password."
                ) from None
            if not api.logged_in():
                raise DeskError("Picnic did not return a session. Try again.")
            self.api = api
            self._save_token()
            return self.state()

    def send_code(self, channel: str) -> dict:
        channel = "EMAIL" if str(channel).upper() == "EMAIL" else "SMS"
        with self._lock:
            if not (self.api and self.pending_2fa):
                raise DeskError("Sign in first, then request a code.")
            try:
                self.api.generate_2fa_code(channel)
            except Picnic2FAError as err:
                raise DeskError(f"Picnic could not send a code: {err}") from None
            return {"sent": channel}

    def verify_code(self, code: str) -> dict:
        code = "".join(ch for ch in str(code) if ch.isalnum())
        with self._lock:
            if not (self.api and self.pending_2fa):
                raise DeskError("Sign in first, then enter the code.")
            if not code:
                raise DeskError("Enter the code Picnic sent you.")
            try:
                self.api.verify_2fa_code(code)
            except Picnic2FAError:
                raise DeskError("That code is not right. Check it and try again.") from None
            self.pending_2fa = False
            self._save_token()
            return self.state()

    def logout(self) -> dict:
        with self._lock:
            self._forget()
            self._remove("history.json")
            return self.state()

    # ---------------------------------------------------------------- shaping

    @staticmethod
    def _tile(item) -> dict:
        """A search tile as the UI wants it.

        display_price is the price shown on the tile (library docs). The
        decorator shapes read here are the ones typed in MRVDH/picnic-api:
        LABEL/PROMO {text}, BASE_PRICE {base_price_text}, UNAVAILABLE {reason,
        explanation: {short_explanation}}; price_ranges holds bundle tiers
        {price, from_quantity}. Anything else is ignored.
        """
        price = item.display_price
        labels = []
        base_price = None
        unavailable = None
        for deco in item.decorators or []:
            if not isinstance(deco, dict):
                continue
            kind = deco.get("type")
            if kind in ("PROMO", "LABEL") and isinstance(deco.get("text"), str) and deco["text"].strip():
                labels.append(deco["text"].strip())
            elif kind == "BASE_PRICE" and isinstance(deco.get("base_price_text"), str):
                base_price = deco["base_price_text"]
            elif kind == "UNAVAILABLE":
                explanation = deco.get("explanation")
                short = explanation.get("short_explanation") if isinstance(explanation, dict) else None
                unavailable = short if isinstance(short, str) and short.strip() else "Not available"
        tiers = [
            tier for tier in item.price_ranges or []
            if isinstance(tier, dict) and isinstance(tier.get("price"), int) and isinstance(tier.get("from_quantity"), int)
        ]
        if price is None and tiers:
            price = min(tiers, key=lambda tier: tier["from_quantity"])["price"]
        return {
            "id": item.id,
            "name": item.name or item.id,
            "unit": item.unit_quantity or "",
            "price": price,
            "labels": labels,
            "tiers": [
                {"from": tier["from_quantity"], "price": tier["price"]}
                for tier in sorted(tiers, key=lambda tier: tier["from_quantity"])
                if tier["from_quantity"] > 1
            ],
            "base_price": base_price,
            "unavailable": unavailable,
            "image": item.image_id,
            "max": item.max_count or 99,
        }

    @staticmethod
    def _quantity(article) -> int:
        for deco in article.decorators or []:
            if deco.type == "QUANTITY" and deco.quantity:
                return deco.quantity
        return 1

    @staticmethod
    def _check(model):
        """Picnic reports most failures as a JSON error body with status 200,
        which the library would parse into an empty model. Surface it instead."""
        raw = model.raw if isinstance(model.raw, dict) else {}
        error = raw.get("error")
        if isinstance(error, dict) and (error.get("message") or error.get("code")):
            raise DeskError(f"Picnic says: {error.get('message') or error.get('code')}")
        return model

    @staticmethod
    def _line_total(line, raw_line) -> int | None:
        """What a basket line costs. The library calls the line's price "a line
        price"; MRVDH/picnic-api documents a PRICE decorator on the line as the
        discounted total, so that wins when present."""
        decorators = raw_line.get("decorators") if isinstance(raw_line, dict) else None
        for deco in decorators if isinstance(decorators, list) else []:
            if isinstance(deco, dict) and deco.get("type") == "PRICE" and isinstance(deco.get("display_price"), int):
                return deco["display_price"]
        return line.display_price if line.display_price is not None else line.price

    def _cart(self, cart) -> dict:
        self._check(cart)
        raw = cart.raw if isinstance(cart.raw, dict) else {}
        raw_lines = raw.get("items") if isinstance(raw.get("items"), list) else []
        # Documented in MRVDH/picnic-api: analytics_context_data.items_list[] has
        # {product_id, is_in_recipe} for every basket item.
        analytics = raw.get("analytics_context_data")
        listed = analytics.get("items_list") if isinstance(analytics, dict) else None
        in_recipe = {
            entry.get("product_id") for entry in (listed if isinstance(listed, list) else [])
            if isinstance(entry, dict) and entry.get("is_in_recipe") is True
        }
        lines = []
        for index, line in enumerate(cart.items):
            line_total = self._line_total(line, raw_lines[index] if index < len(raw_lines) else None)
            for article in line.items:
                qty = self._quantity(article)
                total = line_total if len(line.items) == 1 else None
                lines.append(
                    {
                        "id": article.id,
                        "name": article.name or article.id,
                        "unit": article.unit_quantity or "",
                        "qty": qty,
                        "total": total,
                        "image": article.image_ids[0] if article.image_ids else None,
                        "max": article.max_count or 99,
                        "recipe": article.id in in_recipe,
                    }
                )

        slots = []
        selected = None
        selected_id = cart.selected_slot.slot_id if cart.selected_slot else None
        for slot in cart.delivery_slots:
            entry = {
                "start": slot.window_start,
                "end": slot.window_end,
                "cut_off": slot.cut_off_time,
                "min": slot.minimum_order_value,
                "available": slot.is_available is not False,
            }
            slots.append(entry)
            if selected is None and ((selected_id and slot.slot_id == selected_id) or slot.selected):
                selected = dict(entry)
                # "IMPLICIT", "ACTIVE" or "EXPLICIT"; passed on as is, not interpreted.
                selected["state"] = cart.selected_slot.state if cart.selected_slot else None
        minimums = [s["min"] for s in slots if s["available"] and s["min"]]
        minimum = (selected or {}).get("min") or (min(minimums) if minimums else None)
        return {
            "lines": lines,
            "count": cart.total_count if cart.total_count is not None else sum(l["qty"] for l in lines),
            "total": cart.total_price or 0,
            "checkout_total": cart.checkout_total_price,
            "minimum": minimum,
            "slot": selected,
            "slots": slots,
        }

    # ----------------------------------------------------------------- basket

    def search(self, term: str) -> list[dict]:
        term = (term or "").strip()
        if not term:
            return []
        result = self._check(self._call(lambda api: api.search(term)))
        seen, tiles = set(), []
        for item in result.items:
            if item.id in seen:
                continue
            seen.add(item.id)
            tiles.append(self._tile(item))
            if len(tiles) >= SEARCH_LIMIT:
                break
        return tiles

    def cart(self) -> dict:
        return self._cart(self._call(lambda api: api.get_cart()))

    def change(self, product_id: str, delta: int) -> dict:
        """Add (delta > 0) or remove (delta < 0) units of one product."""
        if not product_id or not isinstance(delta, int) or delta == 0 or abs(delta) > 99:
            raise DeskError("Nothing to change.")
        return self._cart(self._call(lambda api: self._mutate(api, product_id, delta)))

    @staticmethod
    def _mutate(api, product_id: str, delta: int):
        """One basket change, through the library's add_product / remove_product."""
        if delta > 0:
            return api.add_product(product_id, delta)
        return api.remove_product(product_id, -delta)

    @staticmethod
    def _error_in(raw) -> str | None:
        error = raw.get("error") if isinstance(raw, dict) else None
        if isinstance(error, dict) and (error.get("message") or error.get("code")):
            return str(error.get("message") or error.get("code"))
        return None

    def clear(self) -> dict:
        return self._cart(self._call(lambda api: api.clear_cart()))

    # ---------------------------------------------------------- bought before

    def history(self, refresh: bool = False) -> dict:
        cached = self._read("history.json", None)
        fresh = cached and time.time() - cached.get("built", 0) < HISTORY_MAX_AGE
        if cached and fresh and not refresh:
            return cached

        def build(api):
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", DeprecationWarning)
                summaries = api.get_deliveries()
            summaries = [s for s in summaries if s.delivery_id]
            summaries.sort(
                key=lambda s: (s.slot.window_start if s.slot else None) or s.creation_time or "",
                reverse=True,
            )
            products: dict[str, dict] = {}
            used = 0
            for summary in summaries[:HISTORY_DELIVERIES]:
                delivery = api.get_delivery(summary.delivery_id)
                when = (delivery.slot.window_start if delivery.slot else None) or delivery.creation_time
                in_this_delivery = set()
                for order in delivery.orders:
                    for line in order.items:
                        line_total = line.display_price if line.display_price is not None else line.price
                        for article in line.items:
                            if not article.id:
                                continue
                            qty = self._quantity(article)
                            # What was paid then; the basket shows today's price.
                            paid = None
                            if len(line.items) == 1 and isinstance(line_total, int) and line_total > 0:
                                paid = round(line_total / qty)
                            entry = products.setdefault(
                                article.id,
                                {
                                    "id": article.id,
                                    "name": article.name or article.id,
                                    "unit": article.unit_quantity or "",
                                    "image": article.image_ids[0] if article.image_ids else None,
                                    "price": paid,
                                    "max": article.max_count or 99,
                                    "times": 0,
                                    "units": 0,
                                    "last": when,
                                },
                            )
                            entry["units"] += qty
                            in_this_delivery.add(article.id)
                for product_id in in_this_delivery:
                    products[product_id]["times"] += 1
                used += 1
            ordered = sorted(
                products.values(), key=lambda p: (-p["times"], -p["units"], p["name"].lower())
            )
            return {"built": time.time(), "deliveries": used, "products": ordered}

        try:
            built = self._call(build)
        except NotLoggedIn:
            raise
        except Exception:
            if cached:  # a stale list beats an error
                return cached
            raise
        self._write("history.json", built)
        return built

    # ------------------------------------------------------------------ saved

    def saved(self) -> list[dict]:
        return self._read("saved.json", [])

    def toggle_saved(self, product: dict) -> list[dict]:
        product_id = str(product.get("id") or "")
        if not product_id:
            raise DeskError("That product has no id.")
        with self._lock:
            items = self.saved()
            if any(p["id"] == product_id for p in items):
                items = [p for p in items if p["id"] != product_id]
            else:
                items.append(
                    {
                        "id": product_id,
                        "name": str(product.get("name") or product_id)[:200],
                        "unit": str(product.get("unit") or "")[:80],
                        "image": product.get("image") if isinstance(product.get("image"), str) else None,
                        "price": product.get("price") if isinstance(product.get("price"), int) else None,
                        "max": 99,
                    }
                )
            self._write("saved.json", items)
            return items

    # -------------------------------------------------------------- shortcuts

    def _default_shortcuts(self) -> list[dict]:
        pairs = DEFAULT_SHORTCUTS.get(self.country, DEFAULT_SHORTCUTS["NL"])
        return [
            {"label": label, "query": query} if query else {"label": label, "view": RECIPES_VIEW}
            for label, query in pairs
        ]

    def shortcuts(self) -> list[dict]:
        stored = self._read("shortcuts.json", None)
        return stored if isinstance(stored, list) else self._default_shortcuts()

    def set_shortcuts(self, items) -> list[dict]:
        """Replace the shortcut list. None restores the defaults."""
        if items is None:
            self._remove("shortcuts.json")
            return self._default_shortcuts()
        if not isinstance(items, list):
            raise DeskError("Shortcuts must be a list.")
        cleaned = []
        for item in items[:MAX_SHORTCUTS]:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or "").strip()[:40]
            query = str(item.get("query") or "").strip()[:120]
            if item.get("view") == RECIPES_VIEW and label:
                cleaned.append({"label": label, "view": RECIPES_VIEW})
            elif label and query:
                cleaned.append({"label": label, "query": query})
        self._write("shortcuts.json", cleaned)
        return cleaned

    # ---------------------------------------------------------------- recipes
    #
    # Picnic calls a recipe a "selling group". Three calls are used, all taken
    # from MRVDH/picnic-api and ivo-toby/mcp-picnic:
    #   GET  /pages/cookbook-page-content           the recipe overview
    #   GET  /pages/selling-group-details-page      one recipe
    #   POST /pages/task/assign-selling-group-to-basket   put a recipe in the basket
    # The last one is the call the app itself makes when you add a recipe.

    @staticmethod
    @contextmanager
    def _agent(agent: str | None):
        """Temporarily present a different app version. Only called under the lock."""
        headers = picnic_client._HEADERS
        previous = headers.get("x-picnic-agent")
        if agent:
            headers["x-picnic-agent"] = agent
        try:
            yield
        finally:
            headers["x-picnic-agent"] = previous

    def _page(self, api, path: str):
        problem = "no answer"
        for agent in (PAGE_AGENT, None):
            try:
                with self._agent(agent):
                    raw = api._get("/pages/" + path, add_picnic_headers=True)
            except PicnicAuthError:
                raise
            except ValueError:  # not JSON: a page format this add-on cannot read
                problem = "an unreadable page"
                continue
            error = self._error_in(raw)
            if error:
                problem = error
                continue
            return raw
        raise DeskError(f"Picnic could not show that page ({problem}).")

    def _task(self, api, name: str, payload: dict):
        with self._agent(PAGE_AGENT):
            try:
                raw = api._post(f"/pages/task/{name}", {"payload": payload}, add_picnic_headers=True)
            except ValueError:
                raw = {}
        error = self._error_in(raw)
        if error:
            raise DeskError(f"Picnic says: {error}")
        return raw

    def recipes(self, category: str | None = None, refresh: bool = False) -> dict:
        if category is not None and not (PAGE_ID.match(category) and "cattree" in category):
            raise DeskError("Unknown recipe category.")
        key = category or ""
        cached = self._recipe_lists.get(key)
        if cached and not refresh and time.time() - cached[0] < RECIPE_LIST_MAX_AGE:
            return cached[1]
        page = self._call(lambda api: self._page(api, category or "cookbook-page-content"))
        parsed = recipe_pages.parse_list(page)
        parsed["category"] = category
        if category:  # keep offering the categories found on the overview
            overview = self._recipe_lists.get("")
            if overview and not parsed["categories"]:
                parsed["categories"] = overview[1]["categories"]
        if parsed["recipes"]:
            self._recipe_lists[key] = (time.time(), parsed)
        return parsed

    def _recipe_detail(self, api, recipe_id: str, portions: int | None, names: bool) -> dict:
        path = f"selling-group-details-page?selling_group_id={recipe_id}"
        if portions:
            path += f"&portions={portions}"
        detail = recipe_pages.parse_detail(self._page(api, path), recipe_id)
        if detail is None:
            raise DeskError("Picnic sent this recipe in a form this add-on cannot read yet.")
        if names:
            lookups = 0
            for item in detail["ingredients"]:
                if item["name"] or lookups >= RECIPE_NAME_LOOKUPS:
                    continue
                lookups += 1
                try:  # the product page knows what the recipe page left out
                    article = api.get_article(item["id"])
                except PicnicAuthError:
                    raise
                except Exception:
                    article = None
                if article is not None:
                    item["name"] = article.name
                    item["unit"] = item["unit"] or article.unit_quantity or ""
                    item["price"] = item["price"] if item["price"] is not None else article.price
                    item["image"] = item["image"] or article.image_id
        for item in detail["ingredients"]:
            item["name"] = item["name"] or f"Product {item['id']}"
        return detail

    @staticmethod
    def _check_recipe(recipe_id: str, portions):
        if not RECIPE_ID.match(recipe_id or ""):
            raise DeskError("Unknown recipe.")
        if portions is not None and (isinstance(portions, bool) or not isinstance(portions, int) or not 1 <= portions <= 24):
            raise DeskError("Choose between 1 and 24 portions.")

    def recipe(self, recipe_id: str, portions: int | None = None) -> dict:
        self._check_recipe(recipe_id, portions)
        return self._call(lambda api: self._recipe_detail(api, recipe_id, portions, names=True))

    def recipe_add(self, recipe_id: str, portions: int | None, selected) -> dict:
        """Put the ticked ingredients of a recipe in the basket.

        The recipe goes in with the same call the app uses (documented by
        MRVDH/picnic-api and ivo-toby/mcp-picnic). What that call actually put
        in the basket is measured by comparing the basket before and after;
        nothing is assumed about it. Products the user unticked are then taken
        out again, and ticked products the call did not add (cupboard items)
        are added as ordinary products.
        """
        self._check_recipe(recipe_id, portions)
        if not isinstance(selected, list) or not all(isinstance(i, str) for i in selected):
            raise DeskError("Tick at least one ingredient.")
        wanted = set(selected)

        def quantities(cart) -> dict[str, int]:
            totals: dict[str, int] = {}
            for line in cart.items:
                for article in line.items:
                    totals[article.id] = totals.get(article.id, 0) + self._quantity(article)
            return totals

        def run(api):
            detail = self._recipe_detail(api, recipe_id, portions, names=False)
            available = [i for i in detail["ingredients"] if i["available"]]
            chosen = [i for i in available if i["id"] in wanted]
            if not chosen:
                raise DeskError("Tick at least one ingredient that Picnic can deliver.")
            unticked = {i["id"] for i in detail["ingredients"] if i["id"] not in wanted}
            gained: dict[str, int] = {}
            if any(i["checked"] for i in chosen):
                before = quantities(self._check(api.get_cart()))
                self._task(
                    api,
                    "assign-selling-group-to-basket",
                    {"selling_group_id": recipe_id, "portions": detail["portions"]},
                )
                after = quantities(self._check(api.get_cart()))
                gained = {
                    product: count - before.get(product, 0)
                    for product, count in after.items()
                    if count > before.get(product, 0)
                }
                if not gained:
                    raise DeskError("Picnic did not add this recipe to the basket.")
                for product, count in gained.items():
                    if product in unticked:
                        self._mutate(api, product, -count)
            skipped = []
            for item in chosen:
                if item["id"] in gained:
                    continue
                result = self._mutate(api, item["id"], item["qty"])
                if self._error_in(result.raw):
                    skipped.append(item["id"])
            return detail, self._check(api.get_cart()), skipped, bool(gained)

        detail, cart, skipped, linked = self._call(run)
        return {
            "cart": self._cart(cart),
            "name": detail["name"],
            "portions": detail["portions"],
            "added": len([i for i in detail["ingredients"] if i["id"] in wanted and i["available"]]) - len(skipped),
            "skipped": skipped,
            "linked": linked,
        }

    def raw_page(self, page_id: str, recipe_id: str | None = None, portions: int | None = None):
        """The untouched page as Picnic sent it, for working out parsing problems."""
        if not PAGE_ID.match(page_id or ""):
            raise DeskError("Unknown page.")
        path = page_id
        if recipe_id:
            self._check_recipe(recipe_id, portions)
            path += f"?selling_group_id={recipe_id}" + (f"&portions={portions}" if portions else "")
        return self._call(lambda api: self._page(api, path))

    # ------------------------------------------------------------- self-check

    def selfcheck(self) -> dict:
        """Try every read-only call against the live service and say what works.

        Nothing here changes the basket or the account. It exists because the
        recipe pages and pictures could only be tested against sample data
        while this add-on was written.
        """
        if self.api is None or self.pending_2fa:
            raise NotLoggedIn()
        checks: list[dict] = []
        found: dict = {}

        def check(name: str, fn):
            try:
                checks.append({"name": name, "ok": True, "detail": fn()})
            except NotLoggedIn:
                raise
            except Exception as err:  # report, never crash the check run
                text = str(err) if isinstance(err, DeskError) else f"{type(err).__name__}: {err}"
                checks.append({"name": name, "ok": False, "detail": text})

        def need(condition, message: str):
            if not condition:
                raise DeskError(message)

        def picture(ref: str | None) -> str:
            need(ref, "No picture to try: the step before found none.")
            data = self.image(ref)
            need(data, "Picnic did not return a picture.")
            known = data[:4] == b"\x89PNG" or data[:3] == b"\xff\xd8\xff" or data[:4] == b"RIFF" or data.lstrip()[:4] == b"<svg"
            need(known, "The answer was not a picture.")
            return f"Loaded a picture of {len(data) // 1024 or 1} kB."

        def account():
            user = self._call(lambda api: api.get_user())
            need(user.user_id or user.firstname, "Picnic answered without account details.")
            return "Picnic recognises the saved session."

        def search():
            word = {"NL": "melk", "DE": "milch", "FR": "lait"}.get(self.country, "melk")
            tiles = self.search(word)
            need(tiles, f"No products came back for “{word}”.")
            priced = [t for t in tiles if isinstance(t["price"], int)]
            need(priced, "Products came back without prices.")
            found["product_image"] = next((t["image"] for t in tiles if t["image"]), None)
            return f"{len(tiles)} products for “{word}”, {len(priced)} with a price. First: {tiles[0]['name']}."

        def basket():
            cart = self.cart()
            slots = [slot for slot in cart["slots"] if slot["available"]]
            text = f"{cart['count']} items in the basket, {len(slots)} delivery slots on offer"
            return text + (f", minimum order {cart['minimum'] / 100:.2f}." if cart["minimum"] else ".")

        def deliveries():
            def run(api):
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", DeprecationWarning)
                    summaries = [s for s in api.get_deliveries() if s.delivery_id]
                if not summaries:
                    return "No deliveries on this account yet, so Bought before stays empty."
                delivery = api.get_delivery(summaries[0].delivery_id)
                lines = sum(len(order.items) for order in delivery.orders)
                need(lines, "A delivery came back without any products.")
                return f"{len(summaries)} deliveries; one of them read with {lines} product lines."
            return self._call(run)

        def recipe_list():
            listing = self.recipes(refresh=True)
            recipes = listing["recipes"]
            need(recipes, "The recipe overview came back without recipes this add-on can read.")
            named = [r for r in recipes if r["name"]]
            need(named, "Recipes came back without names.")
            found["recipe"] = named[0]["id"]
            found["recipe_image"] = next((r["image"] for r in recipes if r["image"]), None)
            return (
                f"{len(recipes)} recipes, {len(named)} with a name, "
                f"{len([r for r in recipes if r['image']])} with a picture, {len(listing['categories'])} categories."
            )

        def one_recipe():
            need(found.get("recipe"), "No recipe to open: the step before found none.")
            detail = self._call(lambda api: self._recipe_detail(api, found["recipe"], None, names=False))
            items = detail["ingredients"]
            need(items, "The recipe came back without products.")
            named = [i for i in items if not i["name"].startswith("Product ")]
            priced = [i for i in items if i["price"] is not None]
            need(named, "The recipe's products came back without names.")
            return f"{detail['name']}: {len(items)} products, {len(named)} with a name, {len(priced)} with a price."

        check("Account", account)
        check("Search", search)
        check("Product pictures", lambda: picture(found.get("product_image")))
        check("Basket", basket)
        check("Past deliveries", deliveries)
        check("Recipe overview", recipe_list)
        check("Opening a recipe", one_recipe)
        check("Recipe pictures", lambda: picture(found.get("recipe_image")))
        return {
            "checks": checks,
            "not_checked": [
                "Adding and removing products",
                "Adding a recipe to the basket",
            ],
        }

    # ----------------------------------------------------------------- images

    def image(self, image_id: str) -> bytes | None:
        with self._image_lock:
            if image_id in self._images:
                self._images.move_to_end(image_id)
                return self._images[image_id]
        api = self.api
        if api is None:
            return None
        data = None
        if hasattr(api, "demo_image"):  # demo mode, see demo.py
            return api.demo_image(image_id)
        # Sizes named by both python-picnic-api2 and MRVDH/picnic-api; "large" is
        # the one ivo-toby/mcp-picnic uses for recipe pictures.
        sizes = ("medium", "large", "small") if "/" in image_id else ("medium", "small")
        for size in sizes:
            url = IMAGE_URL.format(cc=self.country.lower(), id=image_id, size=size)
            try:
                # Plain GET on the shared session: static files, no lock needed.
                response = api.session.get(url)
            except Exception:
                return None
            if response.status_code == 200 and response.content:
                data = response.content
                break
        if data is None:
            return None
        with self._image_lock:
            self._images[image_id] = data
            while len(self._images) > IMAGE_CACHE_ITEMS:
                self._images.popitem(last=False)
        return data
