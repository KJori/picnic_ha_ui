"""Checks for desk.py, the layer that talks to Picnic.

The real client library runs in every test; only its network calls are
replaced. Where a sample response from the library's own test suite exists it
is used (tests/fixtures/picnic). Other payloads are written out here in the
shapes typed in MRVDH/picnic-api, and say so.

Run from the repository root:  python -m unittest discover tests
"""

import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "picnic_desk" / "app"))

from python_picnic_api2 import PicnicAPI, PicnicAuthError  # noqa: E402
from python_picnic_api2 import client as picnic_client  # noqa: E402
from python_picnic_api2.session import Picnic2FAError  # noqa: E402

import desk as desk_module  # noqa: E402
from demo import RECIPE_BY_ID, DemoPicnicAPI  # noqa: E402
from desk import PAGE_AGENT, Desk, DeskError, NotLoggedIn  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures" / "picnic"
LIBRARY_AGENT = picnic_client._HEADERS["x-picnic-agent"]


def sample(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


class ScriptedAPI(PicnicAPI):
    """The real client with the network swapped for canned answers.

    Every request is recorded as (method, path, body, app version sent).
    """

    def __init__(self, country_code="NL", auth_token=None, **_):
        super().__init__(country_code=country_code, auth_token=auth_token)
        self.calls = []
        self.replies = {}

    def _reply(self, method, path, body):
        self.calls.append((method, path, body, picnic_client._HEADERS["x-picnic-agent"]))
        matches = [prefix for prefix in self.replies if path.startswith(prefix)]
        if not matches:
            raise AssertionError(f"unexpected request {method} {path}")
        answer = self.replies[max(matches, key=len)]
        return answer(self, path, body) if callable(answer) else answer

    def _checked(self, answer):
        # The library's own _get/_post raise on these two error codes.
        if self._contains_auth_error(answer):
            raise PicnicAuthError("Picnic authentication error")
        return answer

    def _get(self, path, add_picnic_headers=False):
        return self._checked(self._reply("GET", path, None))

    def _post(self, path, data=None, base_url_override=None, add_picnic_headers=False):
        return self._checked(self._reply("POST", path, data))

    def _post_2fa(self, path, data=None):
        answer = self._reply("POST", path, data)
        if isinstance(answer, Exception):
            raise answer
        return answer


class RecordingDemo(DemoPicnicAPI):
    """The demo shop, with every request recorded."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.calls = []

    def _get(self, path, add_picnic_headers=False):
        self.calls.append(("GET", path, None, picnic_client._HEADERS["x-picnic-agent"]))
        return super()._get(path, add_picnic_headers)

    def _post(self, path, data=None, base_url_override=None, add_picnic_headers=False):
        self.calls.append(("POST", path, data, picnic_client._HEADERS["x-picnic-agent"]))
        return super()._post(path, data, base_url_override, add_picnic_headers)


class DeskCase(unittest.TestCase):
    api_class = ScriptedAPI

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        (self.dir / "auth.json").write_text('{"token": "saved-token"}')
        self.desk = Desk(str(self.dir), "NL", api_class=self.api_class)
        self.api = self.desk.api

    def posts(self, prefix=""):
        return [(path, body) for method, path, body, _ in self.api.calls if method == "POST" and path.startswith(prefix)]


# ------------------------------------------------------------------- search


def search_page(*selling_units):
    return {"body": {"child": {"children": [{"type": "SELLING_UNIT_TILE", "sellingUnit": unit} for unit in selling_units]}}}


class Search(DeskCase):
    def test_sample_search_page(self):
        self.api.replies["/pages/search-page-results"] = sample("search_page_nl.json")
        tiles = self.desk.search("koffie")
        self.assertEqual(len(tiles), 3)
        self.assertEqual(
            tiles[0],
            {
                "id": "s1016222",
                "name": "Picnic aromatico filterkoffie",
                "unit": "500 gram",
                "price": 799,
                "labels": [],
                "tiers": [],
                "base_price": None,
                "unavailable": None,
                # The tile's sellingUnitImageConfiguration.id, not sellingUnit.image_id (they differ here).
                "image": "d5d9672b5577e31e8a87d44a72954132e441ccab2ca7213b8e712cc7c3143375",
                "max": 99,
            },
        )
        self.assertEqual(self.api.calls[0][:2], ("GET", "/pages/search-page-results?search_term=koffie"))

    def test_tile_pictures_are_tried_the_way_the_tile_names_them(self):
        self.api.replies["/pages/search-page-results"] = sample("search_page_nl.json")
        tiles = self.desk.search("koffie")
        first = self.desk.pictures.candidates(tiles[0]["image"])
        self.assertEqual(first[0], ("d5d9672b5577e31e8a87d44a72954132e441ccab2ca7213b8e712cc7c3143375", "padded.webp"))
        # ... and the product's other picture id is the last resort.
        self.assertEqual(first[-1][0], "cde78c1e46da90d2406c017c372833cd131384c6dddee7772d33aa047c767b4d")
        same = self.desk.pictures.candidates(tiles[1]["image"])  # this tile names one id only
        self.assertEqual({ref for ref, _ in same}, {"c689a8a13efd839245607d38d8cf40e6031d7022310db9bc0ae2b9f2f8ac723a"})

    def test_tile_without_picture_configuration_uses_image_id(self):
        self.api.replies["/pages/search-page-results"] = search_page(
            {"id": "s9", "name": "X", "display_price": 100, "image_id": "a" * 64})
        self.assertEqual(self.desk.search("x")[0]["image"], "a" * 64)

    def test_search_term_is_url_encoded(self):
        self.api.replies["/pages/search-page-results"] = search_page()
        self.desk.search("crème fraîche & co")
        self.assertEqual(self.api.calls[0][1], "/pages/search-page-results?search_term=cr%C3%A8me%20fra%C3%AEche%20%26%20co")

    def test_documented_decorators_and_bundle_tiers(self):
        # Shapes as typed in MRVDH/picnic-api (src/types/common.ts, fusion.ts).
        unit = {
            "id": "s1", "name": "Tomatenblokjes", "display_price": 69, "image_id": "abc", "unit_quantity": "400 gram",
            "max_count": 12,
            "decorators": [
                {"type": "LABEL", "text": "Nieuw"},
                {"type": "PROMO", "text": "BundelBonus", "background_color": "#fff", "text_color": "#000"},
                {"type": "BASE_PRICE", "base_price_text": "€1.73/kg"},
                {"type": "UNAVAILABLE", "reason": "OUT_OF_STOCK", "deeplink": "",
                 "explanation": {"short_explanation": "Tijdelijk uitverkocht", "long_explanation": "…"}},
                {"type": "SOMETHING_NEW", "text": "ignored"},
                "not even a dict",
            ],
            "price_ranges": [{"price": 69, "from_quantity": 1}, {"price": 59, "from_quantity": 4}],
        }
        self.api.replies["/pages/search-page-results"] = search_page(unit)
        tile = self.desk.search("tomaat")[0]
        self.assertEqual(tile["labels"], ["Nieuw", "BundelBonus"])
        self.assertEqual(tile["base_price"], "€1.73/kg")
        self.assertEqual(tile["unavailable"], "Tijdelijk uitverkocht")
        self.assertEqual(tile["tiers"], [{"from": 4, "price": 59}])
        self.assertEqual((tile["price"], tile["max"]), (69, 12))

    def test_unavailable_without_explanation_and_price_only_in_tiers(self):
        unit = {"id": "s2", "name": "X", "decorators": [{"type": "UNAVAILABLE", "reason": "R"}],
                "price_ranges": [{"price": 250, "from_quantity": 1}]}
        self.api.replies["/pages/search-page-results"] = search_page(unit, dict(unit))
        tiles = self.desk.search("x")
        self.assertEqual(len(tiles), 1, "the same product twice is shown once")
        self.assertEqual((tiles[0]["unavailable"], tiles[0]["price"], tiles[0]["tiers"]), ("Not available", 250, []))

    def test_error_body_becomes_a_message(self):
        self.api.replies["/pages/search-page-results"] = {"error": {"code": "X", "message": "Er ging iets mis"}}
        with self.assertRaisesRegex(DeskError, "Er ging iets mis"):
            self.desk.search("melk")

    def test_empty_search_makes_no_request(self):
        self.assertEqual(self.desk.search("   "), [])
        self.assertEqual(self.api.calls, [])


# ------------------------------------------------------------------- basket


def line(product_id, name, qty, line_price, unit_price=None, decorators=None):
    """An order line as typed in MRVDH/picnic-api (OrderLine / OrderArticle)."""
    out = {
        "type": "ORDER_LINE", "id": product_id + "-line", "display_price": line_price, "price": line_price,
        "items": [{
            "type": "ORDER_ARTICLE", "id": product_id, "name": name, "image_ids": ["img-" + product_id],
            "unit_quantity": "1 stuk", "price": unit_price or line_price // qty, "max_count": 50, "perishable": False,
            "decorators": [{"type": "QUANTITY", "quantity": qty}], "selling_unit_contexts_for_mutations": [],
        }],
    }
    if decorators:
        out["decorators"] = decorators
    return out


class Basket(DeskCase):
    def test_sample_empty_cart(self):
        self.api.replies["/cart"] = sample("cart_de.json")
        cart = self.desk.cart()
        self.assertEqual((cart["lines"], cart["count"], cart["total"]), ([], 0, 0))
        self.assertEqual(cart["minimum"], 4500)
        self.assertEqual(len(cart["slots"]), 2)
        self.assertEqual(cart["slot"]["state"], "IMPLICIT")
        self.assertEqual(cart["slots"][0]["start"], "2026-07-16T11:00:00.000+02:00")

    def test_lines_totals_and_recipe_flag(self):
        payload = sample("cart_de.json")
        payload["items"] = [
            line("s1", "Komkommer", 2, 218),
            line("s2", "Tomatenblokjes", 4, 276, decorators=[{"type": "PROMO", "text": "BundelBonus"}, {"type": "PRICE", "display_price": 236}]),
        ]
        payload["total_count"], payload["total_price"] = 6, 454
        payload["analytics_context_data"] = {"items_list": [
            {"product_id": "s1", "quantity": 2, "is_available": True, "is_in_recipe": False},
            {"product_id": "s2", "quantity": 4, "is_available": True, "is_in_recipe": True},
        ]}
        self.api.replies["/cart"] = payload
        cart = self.desk.cart()
        self.assertEqual(
            [(l["id"], l["qty"], l["total"], l["recipe"], l["image"]) for l in cart["lines"]],
            [("s1", 2, 218, False, "img-s1"), ("s2", 4, 236, True, "img-s2")],
        )
        self.assertEqual((cart["count"], cart["total"]), (6, 454))

    def test_selected_slot_by_flag_when_ids_do_not_match(self):
        payload = sample("cart_de.json")
        payload["selected_slot"] = {"slot_id": "elsewhere", "state": "EXPLICIT"}
        payload["delivery_slots"][1]["selected"] = True
        self.api.replies["/cart"] = payload
        slot = self.desk.cart()["slot"]
        self.assertEqual((slot["start"], slot["state"]), ("2026-07-16T17:15:00.000+02:00", "EXPLICIT"))

    def test_changes_use_the_library_calls(self):
        self.api.replies["/cart/"] = sample("cart_de.json")
        self.desk.change("s1019822", 2)
        self.desk.change("s1019822", -1)
        self.desk.clear()
        self.assertEqual(
            self.posts("/cart/"),
            [
                ("/cart/add_product", {"product_id": "s1019822", "count": 2}),
                ("/cart/remove_product", {"product_id": "s1019822", "count": 1}),
                ("/cart/clear", None),
            ],
        )

    def test_change_rejects_nonsense(self):
        for product, delta in (("", 1), ("s1", 0), ("s1", 100), ("s1", "2"), ("s1", 1.5)):
            with self.assertRaises(DeskError):
                self.desk.change(product, delta)
        self.assertEqual(self.api.calls, [])

    def test_picnic_refusal_is_shown_not_swallowed(self):
        self.api.replies["/cart/add_product"] = {"error": {"code": "UNPROCESSABLE", "message": "Niet leverbaar"}}
        with self.assertRaisesRegex(DeskError, "Niet leverbaar"):
            self.desk.change("s1", 1)


# ------------------------------------------------------------------ session


class Session(DeskCase):
    def test_expired_session_signs_out_and_removes_the_token(self):
        def expired(api, path, body):
            raise PicnicAuthError("expired")

        self.api.replies["/cart"] = expired
        with self.assertRaises(NotLoggedIn):
            self.desk.cart()
        self.assertFalse((self.dir / "auth.json").exists())
        self.assertFalse(self.desk.state()["logged_in"])

    def test_state_reads_the_name_from_the_sample_user(self):
        self.api.replies["/user"] = sample("user_de.json")
        state = self.desk.state()
        self.assertTrue(state["logged_in"])
        self.assertEqual(state["name"], sample("user_de.json")["firstname"])

    def _fresh(self):
        (self.dir / "auth.json").unlink()
        made = []

        class Fresh(ScriptedAPI):
            def __init__(inner, *args, **kwargs):
                super().__init__(*args, **kwargs)
                made.append(inner)
                inner.replies = self.replies

        self.replies = {"/user": {"user_id": "u", "firstname": "Koen"}}
        return Desk(str(self.dir), "NL", api_class=Fresh), made

    def test_login_stores_only_the_token_readable_by_owner(self):
        desk, made = self._fresh()

        def login(api, path, body):
            api.session._update_auth_token("token-from-picnic")
            return {"user_id": "u"}

        self.replies["/user/login"] = login
        state = desk.login("koen@example.nl", "geheim-wachtwoord")
        self.assertTrue(state["logged_in"])
        path = self.dir / "auth.json"
        self.assertEqual(json.loads(path.read_text()), {"token": "token-from-picnic"})
        self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
        for file in self.dir.iterdir():
            self.assertNotIn("geheim-wachtwoord", file.read_text())
        sent = made[-1].calls[0]
        self.assertEqual(sent[1], "/user/login")
        self.assertEqual(sent[2]["key"], "koen@example.nl")
        self.assertNotIn("geheim-wachtwoord", json.dumps(sent[2]), "the library sends a hash, never the password")

    def test_wrong_password(self):
        desk, _ = self._fresh()
        self.replies["/user/login"] = {"error": {"code": "AUTH_INVALID_CRED", "message": "Invalid credentials"}}
        with self.assertRaisesRegex(DeskError, "did not accept"):
            desk.login("koen@example.nl", "fout")
        self.assertFalse((self.dir / "auth.json").exists())

    def test_verification_code_flow(self):
        desk, made = self._fresh()

        def login(api, path, body):
            api.session._update_auth_token("half-token")
            return {"second_factor_authentication_required": True}

        self.replies["/user/login"] = login
        self.replies["/user/2fa/generate"] = None
        self.replies["/user/2fa/verify"] = lambda api, path, body: (
            None if body == {"otp": "123456"} else Picnic2FAError("Invalid code", code="INVALID_OTP")
        )
        state = desk.login("koen@example.nl", "geheim")
        self.assertEqual((state["logged_in"], state["needs_code"]), (False, True))
        self.assertFalse((self.dir / "auth.json").exists(), "nothing is saved before the code is accepted")
        with self.assertRaises(NotLoggedIn):
            desk.cart()
        self.assertEqual(desk.send_code("email"), {"sent": "EMAIL"})
        self.assertEqual(made[-1].calls[-1][1:3], ("/user/2fa/generate", {"channel": "EMAIL"}))
        with self.assertRaisesRegex(DeskError, "not right"):
            desk.verify_code("000000")
        self.assertTrue(desk.verify_code(" 123 456 ")["logged_in"])
        self.assertEqual(json.loads((self.dir / "auth.json").read_text()), {"token": "half-token"})


# ------------------------------------------------------------ bought before


class History(DeskCase):
    def test_sample_delivery(self):
        self.api.replies["/deliveries/summary"] = sample("current_deliveries_de.json")
        self.api.replies["/deliveries/"] = sample("delivery_de.json")
        history = self.desk.history()
        self.assertEqual(history["deliveries"], 1)
        self.assertEqual(
            history["products"],
            [{
                "id": "s1021945", "name": "Edeka Herzstücke Brioche Burger Buns", "unit": "4 Stück",
                "image": "6eec280a71983e86775ddbd0975a42adaf6e954f9380960c37d2c2163c2c5e99",
                "price": 169, "max": 99, "times": 1, "units": 1, "last": "2026-07-15T14:15:00.000+02:00",
            }],
        )
        self.assertEqual(self.posts("/deliveries/summary"), [("/deliveries/summary", [])])

    def test_cached_until_asked_again(self):
        self.api.replies["/deliveries/summary"] = sample("current_deliveries_de.json")
        self.api.replies["/deliveries/"] = sample("delivery_de.json")
        self.desk.history()
        requests = len(self.api.calls)
        self.desk.history()
        self.assertEqual(len(self.api.calls), requests)
        self.desk.history(refresh=True)
        self.assertGreater(len(self.api.calls), requests)

    def test_frequency_order_over_several_deliveries(self):
        def delivery(api, path, body):
            number = path.rsplit("/", 1)[1]
            lines = {"d1": [line("s1", "A", 1, 100), line("s2", "B", 3, 300)], "d2": [line("s2", "B", 1, 100)]}[number]
            return {"delivery_id": number, "slot": {"window_start": f"2026-10-0{number[1]}T10:00:00.000+02:00"},
                    "orders": [{"type": "ORDER", "items": lines}]}

        self.api.replies["/deliveries/summary"] = [
            {"delivery_id": "d1", "slot": {"window_start": "2026-10-01T10:00:00.000+02:00"}},
            {"delivery_id": "d2", "slot": {"window_start": "2026-10-02T10:00:00.000+02:00"}},
        ]
        self.api.replies["/deliveries/"] = delivery
        products = self.desk.history()["products"]
        self.assertEqual([(p["id"], p["times"], p["units"], p["price"]) for p in products], [("s2", 2, 4, 100), ("s1", 1, 1, 100)])


# ------------------------------------------------------------------ recipes

RECIPE = next(rid for rid, row in RECIPE_BY_ID.items() if row[0].startswith("Pasta met"))
OATS = next(rid for rid, row in RECIPE_BY_ID.items() if row[0].startswith("Havermout"))


class RecipePages(DeskCase):
    def test_pages_ask_with_the_newer_app_version_and_put_it_back(self):
        self.api.replies["/pages/cookbook-page-content"] = {"body": {}}
        self.desk.recipes()
        self.assertEqual(self.api.calls[0], ("GET", "/pages/cookbook-page-content", None, PAGE_AGENT))
        self.assertEqual(picnic_client._HEADERS["x-picnic-agent"], LIBRARY_AGENT)

    def test_falls_back_to_the_library_app_version(self):
        def answer(api, path, body):
            if picnic_client._HEADERS["x-picnic-agent"] == PAGE_AGENT:
                return {"error": {"code": "NOT_FOUND", "message": "page-template was not found"}}
            return {"body": {}}

        self.api.replies["/pages/cookbook-page-content"] = answer
        self.assertEqual(self.desk.recipes()["recipes"], [])
        self.assertEqual([call[3] for call in self.api.calls], [PAGE_AGENT, LIBRARY_AGENT])

    def test_page_that_never_loads(self):
        self.api.replies["/pages/"] = {"error": {"code": "NOT_FOUND", "message": "page-template was not found"}}
        with self.assertRaisesRegex(DeskError, "page-template was not found"):
            self.desk.recipes()
        self.assertEqual(picnic_client._HEADERS["x-picnic-agent"], LIBRARY_AGENT)

    def test_page_that_is_not_json(self):
        def not_json(api, path, body):
            raise ValueError("Expecting value")

        self.api.replies["/pages/"] = not_json
        with self.assertRaisesRegex(DeskError, "unreadable page"):
            self.desk.recipes()

    def test_agent_is_restored_after_an_expired_session(self):
        def expired(api, path, body):
            raise PicnicAuthError("expired")

        self.api.replies["/pages/"] = expired
        with self.assertRaises(NotLoggedIn):
            self.desk.recipes()
        self.assertEqual(picnic_client._HEADERS["x-picnic-agent"], LIBRARY_AGENT)

    def test_input_checks_make_no_request(self):
        for call in (
            lambda: self.desk.recipes("../../etc/passwd"),
            lambda: self.desk.recipes("cookbook-page-content"),
            lambda: self.desk.recipe("nope"),
            lambda: self.desk.recipe("a" * 24, 0),
            lambda: self.desk.recipe("a" * 24, 25),
            lambda: self.desk.recipe("a" * 24, True),
            lambda: self.desk.recipe_add("a" * 24, 2, "s1"),
            lambda: self.desk.raw_page("a/b"),
        ):
            with self.assertRaises(DeskError):
                call()
        self.assertEqual(self.api.calls, [])

    def test_missing_names_are_looked_up_on_the_product_page(self):
        unit = {"ingredient_id": "i", "selling_unit_id": "s1010706", "quantity": 1, "checked": True}
        self.api.replies["/pages/selling-group-details-page"] = {
            "body": {"analytics": {"contexts": [{"data": {"recipe_id": "a" * 24, "recipe_name": "Test", "portions": 2, "selling_units": [unit]}}]}}
        }
        self.api.replies["/pages/product-details-page-root"] = sample("product_details_page_nl.json")
        item = self.desk.recipe("a" * 24)["ingredients"][0]
        article = PicnicAPI.get_article(self.api, "s1010706")
        self.assertTrue(article.name)
        self.assertEqual((item["name"], item["price"], item["image"]), (article.name, article.price, article.image_id))


class RecipeBasket(DeskCase):
    api_class = RecordingDemo

    def setUp(self):
        super().setUp()
        self.api.login("demo@example.nl", "x")
        self.api.calls.clear()

    def basket(self):
        return {l["id"]: l["qty"] for l in self.desk.cart()["lines"]}

    def test_adds_with_the_documented_call_and_takes_out_what_was_unticked(self):
        self.desk.change("s1011", 1)  # one paprika was already in the basket
        self.api.calls.clear()
        # ticked: penne, kikkererwten, tomatenblokjes, and olijfolie from the cupboard list
        result = self.desk.recipe_add(RECIPE, 4, ["s1019", "s1016", "s1024", "s1026"])
        self.assertEqual(
            self.posts("/pages/task/"),
            [("/pages/task/assign-selling-group-to-basket", {"payload": {"selling_group_id": RECIPE, "portions": 4}})],
        )
        task_call = next(call for call in self.api.calls if call[1].startswith("/pages/task/"))
        self.assertEqual(task_call[3], PAGE_AGENT)
        self.assertEqual(
            self.posts("/cart/"),
            [
                ("/cart/remove_product", {"product_id": "s1011", "count": 2}),  # what the recipe added, not the one from before
                ("/cart/add_product", {"product_id": "s1026", "count": 2}),
            ],
        )
        self.assertEqual(self.basket(), {"s1011": 1, "s1019": 2, "s1016": 2, "s1024": 4, "s1026": 2})
        self.assertEqual((result["added"], result["skipped"], result["linked"], result["portions"]), (4, [], True, 4))
        flags = {l["id"]: l["recipe"] for l in result["cart"]["lines"]}
        self.assertTrue(flags["s1019"])
        self.assertFalse(flags["s1026"])

    def test_cupboard_items_only_does_not_touch_the_recipe_call(self):
        result = self.desk.recipe_add(RECIPE, None, ["s1015"])
        self.assertEqual(self.posts("/pages/task/"), [])
        self.assertEqual(self.posts("/cart/"), [("/cart/add_product", {"product_id": "s1015", "count": 1})])
        self.assertEqual((result["added"], result["linked"]), (1, False))

    def test_unavailable_product_is_left_out(self):
        detail = self.desk.recipe(OATS)
        self.assertEqual([i["available"] for i in detail["ingredients"]], [True, True, False, True])
        result = self.desk.recipe_add(OATS, None, [i["id"] for i in detail["ingredients"]])
        self.assertEqual(self.basket(), {"s1021": 1, "s1001": 1, "s1022": 1})
        self.assertEqual((result["added"], result["skipped"]), (3, []))

    def test_nothing_ticked(self):
        with self.assertRaisesRegex(DeskError, "Tick at least one"):
            self.desk.recipe_add(RECIPE, 2, [])
        with self.assertRaisesRegex(DeskError, "Tick at least one"):
            self.desk.recipe_add(OATS, 2, ["s1007"])
        self.assertEqual(self.posts(), [])

    def test_recipe_call_refused(self):
        refuse = {"error": {"code": "X", "message": "Niet mogelijk"}}
        original = self.api._assign_recipe
        self.api._assign_recipe = lambda payload: refuse
        self.addCleanup(setattr, self.api, "_assign_recipe", original)
        with self.assertRaisesRegex(DeskError, "Niet mogelijk"):
            self.desk.recipe_add(RECIPE, 2, ["s1019"])
        self.assertEqual(self.basket(), {})

    def test_recipe_call_that_adds_nothing(self):
        self.api._assign_recipe = lambda payload: {"cart": {}}
        with self.assertRaisesRegex(DeskError, "did not add this recipe"):
            self.desk.recipe_add(RECIPE, 2, ["s1019"])

    def test_listing_categories_and_cache(self):
        listing = self.desk.recipes()
        self.assertEqual(len(listing["recipes"]), 6)
        self.assertTrue(all(r["name"] and r["image"].startswith("recipes/") for r in listing["recipes"]))
        self.assertEqual([c["id"] for c in listing["categories"]], ["recipe_cattree_20minuten", "recipe_cattree_vegan"])
        requests = len(self.api.calls)
        self.desk.recipes()
        self.assertEqual(len(self.api.calls), requests, "the overview is cached for a few minutes")
        quick = self.desk.recipes("recipe_cattree_20minuten")
        self.assertEqual(len(quick["recipes"]), 3)
        self.assertEqual(quick["categories"], listing["categories"])

    def test_portions_change_the_amounts(self):
        two = {i["id"]: i["qty"] for i in self.desk.recipe(RECIPE)["ingredients"]}
        six = {i["id"]: i["qty"] for i in self.desk.recipe(RECIPE, 6)["ingredients"]}
        self.assertEqual((two["s1024"], six["s1024"]), (2, 6))
        self.assertIn(f"/pages/selling-group-details-page?selling_group_id={RECIPE}&portions=6", [c[1] for c in self.api.calls])


# ------------------------------------------------------- shortcuts, saved, check


class Extras(DeskCase):
    api_class = RecordingDemo

    def test_shortcut_defaults_follow_the_country(self):
        self.assertEqual(self.desk.shortcuts()[0], {"label": "Brood", "query": "brood"})
        self.assertEqual(self.desk.shortcuts()[-1], {"label": "Gerechten", "view": "recipes"})
        german = Desk(str(self.dir / "de"), "DE", api_class=RecordingDemo)
        self.assertEqual(german.shortcuts()[0]["label"], "Brot")

    def test_shortcuts_are_cleaned_and_can_be_restored(self):
        saved = self.desk.set_shortcuts([
            {"label": "  Tofu ", "query": " tofu, tempeh "}, {"label": "", "query": "x"}, {"label": "y"},
            "junk", {"label": "Koken", "view": "recipes"}, {"label": "L" * 90, "query": "q" * 500},
        ])
        self.assertEqual(saved[:2], [{"label": "Tofu", "query": "tofu, tempeh"}, {"label": "Koken", "view": "recipes"}])
        self.assertEqual((len(saved[2]["label"]), len(saved[2]["query"])), (40, 120))
        self.assertEqual(self.desk.shortcuts(), saved)
        self.assertEqual(self.desk.set_shortcuts(None)[0]["label"], "Brood")
        with self.assertRaises(DeskError):
            self.desk.set_shortcuts("nope")

    def test_saved_products_toggle(self):
        product = {"id": "s1", "name": "Tofu", "unit": "375 gram", "price": 179, "image": "abc", "rogue": "<script>"}
        self.assertEqual(self.desk.toggle_saved(product), [{"id": "s1", "name": "Tofu", "unit": "375 gram", "image": "abc", "price": 179, "max": 99}])
        self.assertEqual(self.desk.toggle_saved(product), [])
        with self.assertRaises(DeskError):
            self.desk.toggle_saved({"name": "no id"})

    def test_selfcheck_passes_in_the_demo_shop_and_changes_nothing(self):
        self.api.login("demo@example.nl", "x")
        self.api.calls.clear()
        report = self.desk.selfcheck()
        self.assertEqual([c["name"] for c in report["checks"] if not c["ok"]], [], report)
        self.assertEqual(len(report["checks"]), 9)
        changing = [c for c in self.api.calls if c[0] == "POST" and c[1] != "/deliveries/summary"]
        self.assertEqual(changing, [], "the self-check must not change anything")

    def test_selfcheck_reports_a_broken_part_and_carries_on(self):
        self.api.login("demo@example.nl", "x")
        self.api._recipe_list_payload = lambda category: {"body": {"note": "layout changed"}}
        report = {c["name"]: c for c in self.desk.selfcheck()["checks"]}
        self.assertFalse(report["Recipe overview"]["ok"])
        self.assertIn("without recipes", report["Recipe overview"]["detail"])
        self.assertFalse(report["Opening a recipe"]["ok"])
        self.assertTrue(report["Search"]["ok"] and report["Basket"]["ok"] and report["Past deliveries"]["ok"])

    def test_selfcheck_needs_a_session(self):
        self.desk.logout()
        with self.assertRaises(NotLoggedIn):
            self.desk.selfcheck()

    def test_logout_forgets_everything_private(self):
        self.api.login("demo@example.nl", "x")
        self.desk.history()
        self.desk.logout()
        self.assertEqual(sorted(p.name for p in self.dir.iterdir()), [])


class Answer:
    def __init__(self, status, content=b""):
        self.status_code, self.content, self.headers = status, content, {}


PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
WEBP = b"RIFF" + b"\x00" * 4 + b"WEBP" + b"0" * 64


class PicturesThroughDesk(DeskCase):
    """Picture loading from the Desk's point of view (the loader itself is
    covered in test_pictures.py)."""

    def serve(self, answer):
        asked = []

        def get(url, **kwargs):
            asked.append(url)
            return answer(url)

        self.api.session.get = get
        return asked

    def test_uses_the_signed_in_session_and_the_country_host(self):
        asked = self.serve(lambda url: Answer(200, WEBP))
        self.assertEqual(self.desk.image("a" * 64), WEBP)
        self.assertEqual(asked, ["https://storefront-prod.nl.picnicinternational.com/static/images/" + "a" * 64 + "/padded.webp"])
        german = Desk(str(self.dir), "DE", api_class=ScriptedAPI)
        seen = []
        german.api.session.get = lambda url, **kwargs: seen.append(url) or Answer(200, PNG)
        german.image("c" * 64)
        self.assertTrue(seen[0].startswith("https://storefront-prod.de.picnicinternational.com/static/images/"))

    def test_signed_out_loads_nothing(self):
        self.desk.logout()
        self.assertIsNone(self.desk.image("a" * 64))

    def selfcheck_replies(self):
        self.api.replies.update({
            "/user": sample("user_de.json"),
            "/pages/search-page-results": sample("search_page_nl.json"),
            "/pages/product-details-page-root": sample("product_details_page_nl.json"),
            "/cart": sample("cart_de.json"),
            "/deliveries/summary": sample("current_deliveries_de.json"),
            "/deliveries/": sample("delivery_de.json"),
            "/pages/": {"error": {"code": "NOT_FOUND", "message": "page-template was not found"}},
        })

    def test_selfcheck_says_which_address_form_worked(self):
        self.selfcheck_replies()
        self.serve(lambda url: Answer(200, WEBP) if url.endswith("/padded.webp") else Answer(404))
        report = {c["name"]: c for c in self.desk.selfcheck()["checks"]}
        self.assertTrue(report["Product pictures"]["ok"], report["Product pictures"])
        self.assertEqual(report["Product pictures"]["detail"], "3 of 3 pictures loaded. Worked as: padded.webp (3).")

    def test_selfcheck_spells_out_a_picture_that_failed(self):
        self.selfcheck_replies()
        first = "d5d9672b5577e31e8a87d44a72954132e441ccab2ca7213b8e712cc7c3143375"
        self.serve(lambda url: Answer(403) if first in url or "cde78c1e" in url else Answer(200, PNG))
        report = {c["name"]: c for c in self.desk.selfcheck()["checks"]}
        self.assertEqual(
            {name: c["ok"] for name, c in report.items()},
            {"Account": True, "Search": True, "Product pictures": False, "Product page": True, "Basket": True,
             "Past deliveries": True, "Recipe overview": False, "Opening a recipe": False, "Recipe pictures": False},
        )
        detail = report["Product pictures"]["detail"]
        self.assertTrue(detail.startswith("2 of 3 pictures loaded. Worked as: padded.webp (2). Picture d5d9672b5577e31e… failed; tried padded.webp: 403, medium.png: 403"), detail)
        self.assertIn("cde78c1e46…/padded.webp: 403", detail)
        self.assertIn("page-template was not found", report["Recipe overview"]["detail"])
        self.assertIn("description found", report["Product page"]["detail"])


class ProductPage(DeskCase):
    PATH = "/pages/product-details-page-root?id=s1016222&show_category_action=true"

    def test_sample_page_through_the_library_reader(self):
        self.api.replies["/pages/product-details-page-root"] = sample("product_details_page_nl.json")
        info = self.desk.product("s1016222")
        self.assertEqual(
            info,
            {
                "id": "s1016222", "name": "Picnic Aromatico filterkoffie", "brand": "Picnic", "unit": "500 gram",
                "price": 799, "was": None, "price_per_unit": "€15.98/kg", "multipack": False,
                "images": ["1be1d07e57ea3991445a91960535a2b4593caf75c7e157a42a19ba61aaf00000"],
                "description": "Onze aromatische filterkoffie met een volle smaak en een aangenaam aroma.",
                "highlights": ["**Volle** smaak", "Snelfiltermaling"], "allergens": [], "sections": [],
            },
        )
        # Same request as the library's get_article; asked again as the newer app version
        # because the first answer had no fold-out sections.
        self.assertEqual([(c[1], c[3]) for c in self.api.calls], [(self.PATH, LIBRARY_AGENT), (self.PATH, PAGE_AGENT)])
        self.assertEqual(picnic_client._HEADERS["x-picnic-agent"], LIBRARY_AGENT)

    def test_fold_out_sections_from_the_newer_app_version_are_merged_in(self):
        older = sample("product_details_page_nl.json")
        newer = sample("product_details_page_nl.json")
        newer["body"]["child"]["child"]["children"] += [
            {"type": "PML", "id": "product-page-allergies", "pml": {"component": {"children": [
                {"type": "RICH_TEXT", "markdown": "Bevat"}, {"type": "RICH_TEXT", "markdown": "#(#333333)Soja#(#333333)"}]}}},
            {"type": "PML", "id": "accordion-list", "pml": {"component": {"items": [
                {"header": {"type": "RICH_TEXT", "markdown": "**Ingrediënten**"},
                 "body": {"type": "RICH_TEXT", "markdown": "Gemalen **koffie**."}}]}}},
        ]
        self.api.replies["/pages/product-details-page-root"] = (
            lambda api, path, body: newer if picnic_client._HEADERS["x-picnic-agent"] == PAGE_AGENT else older)
        info = self.desk.product("s1016222")
        self.assertEqual(info["sections"], [{"title": "Ingrediënten", "text": "Gemalen **koffie**."}])
        self.assertEqual(info["allergens"], [{"label": "Bevat", "items": ["Soja"]}])
        self.assertEqual(info["name"], "Picnic Aromatico filterkoffie")

    def test_remembered_for_a_while(self):
        self.api.replies["/pages/product-details-page-root"] = sample("product_details_page_nl.json")
        self.desk.product("s1016222")
        requests = len(self.api.calls)
        self.desk.product("s1016222")
        self.assertEqual(len(self.api.calls), requests)
        self.desk.product("s1016222", refresh=True)
        self.assertGreater(len(self.api.calls), requests)

    def test_errors_and_unreadable_pages(self):
        self.api.replies["/pages/product-details-page-root"] = {"error": {"code": "X", "message": "Niet gevonden"}}
        with self.assertRaisesRegex(DeskError, "Niet gevonden"):
            self.desk.product("s100")
        self.api.replies["/pages/product-details-page-root"] = {"body": {"something": "else"}}
        with self.assertRaisesRegex(DeskError, "cannot read yet"):
            self.desk.product("s123")
        requests = len(self.api.calls)
        for bad in ("", "abc", "s1; drop", "../x", "s" + "1" * 20):
            with self.assertRaises(DeskError):
                self.desk.product(bad)
        self.assertEqual(len(self.api.calls), requests)

    def test_second_request_failing_does_not_lose_the_first(self):
        def answer(api, path, body):
            if picnic_client._HEADERS["x-picnic-agent"] == PAGE_AGENT:
                raise ValueError("not JSON")
            return sample("product_details_page_nl.json")

        self.api.replies["/pages/product-details-page-root"] = answer
        self.assertEqual(self.desk.product("s1016222")["price"], 799)
        self.assertEqual(picnic_client._HEADERS["x-picnic-agent"], LIBRARY_AGENT)

    def test_raw_page_for_a_product(self):
        self.api.replies["/pages/product-details-page-root"] = sample("product_details_page_nl.json")
        self.desk.raw_page("product-details-page-root", product_id="s1016222")
        self.assertEqual(self.api.calls[0][1], self.PATH)
        with self.assertRaises(DeskError):
            self.desk.raw_page("product-details-page-root", product_id="nope")


class ProductPageInDemo(DeskCase):
    api_class = RecordingDemo

    def setUp(self):
        super().setUp()
        self.api.login("demo@example.nl", "x")

    def test_food_product(self):
        info = self.desk.product("s1004")
        self.assertEqual((info["name"], info["brand"], info["unit"], info["price"]), ("Picnic Tofu naturel", "Picnic", "375 gram", 179))
        self.assertEqual([section["title"] for section in info["sections"]], ["Ingrediënten", "Voedingswaarde", "Extra informatie"])
        self.assertIn("**soja**bonen", info["sections"][0]["text"])
        self.assertEqual(info["allergens"], [{"label": "Bevat", "items": ["Soja"]}])
        self.assertEqual(len(info["images"]), 2)

    def test_sale_price_and_may_contain(self):
        coffee = self.desk.product("s1027")
        self.assertEqual((coffee["price"], coffee["was"]), (799, 999))
        peanut = self.desk.product("s1022")
        self.assertEqual(peanut["allergens"], [{"label": "Bevat", "items": ["Pinda's"]}, {"label": "Bevat mogelijk", "items": ["Noten", "Sesam"]}])

    def test_household_product_has_no_ingredients(self):
        info = self.desk.product("s1032")
        self.assertEqual((info["sections"], info["allergens"]), ([], []))
        self.assertTrue(info["description"])


class RecipePrices(DeskCase):
    api_class = RecordingDemo

    def setUp(self):
        super().setUp()
        self.api.login("demo@example.nl", "x")
        self.api.calls.clear()

    def test_price_of_what_picnic_ticks_by_default(self):
        # penne 0,99 + paprika 1,69 + kikkererwten 0,79 + 2 x tomatenblokjes 0,69; cupboard items left out
        self.assertEqual(self.desk.recipe_price(RECIPE), {"price": 485, "portions": 2, "complete": True})

    def test_remembered_on_disk_for_a_day(self):
        self.desk.recipe_price(RECIPE)
        requests = len(self.api.calls)
        self.desk.recipe_price(RECIPE)
        self.assertEqual(len(self.api.calls), requests)
        again = Desk(str(self.dir), "NL", api_class=RecordingDemo)
        self.assertEqual(again.recipe_price(RECIPE)["price"], 485)
        self.assertEqual(again.api.calls, [])
        stored = json.loads((self.dir / "recipe_prices.json").read_text())
        stored[RECIPE]["at"] -= 25 * 3600
        (self.dir / "recipe_prices.json").write_text(json.dumps(stored))
        older = Desk(str(self.dir), "NL", api_class=RecordingDemo)
        older.api.login("demo@example.nl", "x")
        older.api.calls.clear()
        older.recipe_price(RECIPE)
        self.assertEqual(len(older.api.calls), 1)

    def test_opening_a_recipe_fills_in_its_price(self):
        self.desk.recipe(RECIPE)
        requests = len(self.api.calls)
        self.assertEqual(self.desk.recipe_price(RECIPE)["price"], 485)
        self.assertEqual(len(self.api.calls), requests)
        self.desk.recipe(RECIPE, 6)  # other portions do not overwrite the default-portions price
        self.assertEqual(self.desk.recipe_price(RECIPE), {"price": 485, "portions": 2, "complete": True})

    def test_unavailable_product_is_left_out_of_the_price(self):
        # havermout 0,75 + havermelk 1,39; the unavailable bananas and the cupboard item do not count
        self.assertEqual(self.desk.recipe_price(OATS), {"price": 214, "portions": 2, "complete": True})

    def test_missing_prices_are_flagged(self):
        cost = Desk._recipe_cost({"portions": 4, "ingredients": [
            {"checked": True, "available": True, "price": 100, "qty": 2},
            {"checked": True, "available": True, "price": None, "qty": 1},
            {"checked": False, "available": True, "price": 999, "qty": 1},
        ]})
        self.assertEqual(cost, {"price": 200, "portions": 4, "complete": False})
        nothing = Desk._recipe_cost({"portions": 2, "ingredients": [{"checked": True, "available": True, "price": None, "qty": 1}]})
        self.assertEqual(nothing, {"price": None, "portions": 2, "complete": False})

    def test_input_is_checked(self):
        with self.assertRaises(DeskError):
            self.desk.recipe_price("nope")


class Constants(unittest.TestCase):
    def test_app_version_matches_the_other_client(self):
        # MRVDH/picnic-api src/http-client.ts, the version its recipe calls were checked with.
        self.assertEqual(PAGE_AGENT, "30100;1.246.1-15599;")

    def test_image_references(self):
        ok = ["cde78c1e46da90d2406c017c372833cd131384c6dddee7772d33aa047c767b4d", "recipes/abc12345"]
        bad = ["../x", "recipes/../../etc", "a/b/c", "x" * 200, "recipes/", "http://evil/x", "short"]
        self.assertTrue(all(desk_module.IMAGE_REF.match(ref) for ref in ok))
        self.assertFalse(any(desk_module.IMAGE_REF.match(ref) for ref in bad))


if __name__ == "__main__":
    unittest.main()
