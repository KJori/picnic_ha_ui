"""Checks for the web layer, run against the built-in demo shop.

Run from the repository root:  python -m unittest discover tests
"""

import os
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

APP = Path(__file__).resolve().parents[1] / "picnic_desk" / "app"
sys.path.insert(0, str(APP))

import server  # noqa: E402

GATEWAY = {"REMOTE_ADDR": "172.30.32.2"}


class ServerCase(unittest.TestCase):
    extra_env: dict = {}

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.data = Path(tmp.name)
        env = {"PICNIC_DEMO": "1", "DATA_DIR": tmp.name, "COUNTRY_CODE": "NL", **self.extra_env}
        patcher = mock.patch.dict(os.environ, env)
        patcher.start()
        self.addCleanup(patcher.stop)
        os.environ.pop("INGRESS_ONLY", None) if "INGRESS_ONLY" not in self.extra_env else None
        self.client = server.create_app().test_client()

    def status(self, path, **kwargs):
        response = self.client.get(path, **kwargs)
        response.close()
        return response.status_code

    def sign_in(self, password="x"):
        return self.client.post("/api/login", json={"email": "demo@example.nl", "password": password})


class SignedOut(ServerCase):
    def test_everything_private_needs_a_session(self):
        for path in ("/api/cart", "/api/search?q=tofu", "/api/history", "/api/recipes", "/api/selfcheck",
                     "/api/recipes/" + "a" * 24, "/api/raw-page/cookbook-page-content"):
            response = self.client.get(path)
            self.assertEqual((response.status_code, response.get_json().get("signed_out")), (401, True), path)
        self.assertEqual(self.client.post("/api/cart/change", json={"id": "s1004", "delta": 1}).status_code, 401)
        self.assertEqual(self.client.get("/api/image/" + "a" * 64).status_code, 404)

    def test_state_and_page_are_public(self):
        state = self.client.get("/api/state").get_json()
        self.assertEqual((state["logged_in"], state["needs_code"], state["demo"]), (False, False, True))
        page = self.client.get("/")
        self.assertEqual(page.status_code, 200)
        self.assertIn("no-cache", page.headers["Cache-Control"])
        page.close()

    def test_login_needs_both_fields(self):
        self.assertEqual(self.client.post("/api/login", json={"email": "", "password": ""}).status_code, 400)
        self.assertEqual(self.client.post("/api/login", data="not json").status_code, 400)

    def test_verification_code_round_trip(self):
        self.assertTrue(self.sign_in("2fa").get_json()["needs_code"])
        self.assertEqual(self.client.get("/api/cart").status_code, 401)
        self.assertEqual(self.client.post("/api/code/send", json={"channel": "SMS"}).get_json(), {"sent": "SMS"})
        self.assertEqual(self.client.post("/api/code/verify", json={"code": "000000"}).status_code, 400)
        self.assertTrue(self.client.post("/api/code/verify", json={"code": "123456"}).get_json()["logged_in"])
        self.assertEqual(self.client.get("/api/cart").status_code, 200)


class SignedIn(ServerCase):
    def setUp(self):
        super().setUp()
        self.assertTrue(self.sign_in().get_json()["logged_in"])

    def test_search_and_basket(self):
        products = self.client.get("/api/search?q=tofu").get_json()["products"]
        self.assertEqual([p["id"] for p in products], ["s1004", "s1005"])
        cart = self.client.post("/api/cart/change", json={"id": "s1004", "delta": 2}).get_json()
        self.assertEqual([(l["id"], l["qty"], l["total"]) for l in cart["lines"]], [("s1004", 2, 358)])
        cart = self.client.post("/api/cart/change", json={"id": "s1004", "delta": -5}).get_json()
        self.assertEqual(cart["lines"], [])
        self.assertEqual(self.client.post("/api/cart/clear").get_json()["count"], 0)

    def test_basket_input_is_checked(self):
        for body in ({"id": "s1004", "delta": True}, {"id": "s1004", "delta": "1"}, {"id": "s1004", "delta": 0},
                     {"id": "s1004"}, {"delta": 1}, {"id": "s1004", "delta": 1000}, []):
            response = self.client.post("/api/cart/change", json=body)
            self.assertEqual(response.status_code, 400, body)
        self.assertEqual(self.client.get("/api/cart").get_json()["count"], 0)

    def test_product_picnic_will_not_add(self):
        response = self.client.post("/api/cart/change", json={"id": "s1007", "delta": 1})
        self.assertEqual(response.status_code, 400)
        self.assertIn("niet leverbaar", response.get_json()["error"])

    def test_recipes(self):
        listing = self.client.get("/api/recipes").get_json()
        recipe_id = listing["recipes"][0]["id"]
        detail = self.client.get(f"/api/recipes/{recipe_id}?portions=4").get_json()
        self.assertEqual(detail["portions"], 4)
        ids = [i["id"] for i in detail["ingredients"] if i["checked"]]
        added = self.client.post(f"/api/recipes/{recipe_id}/add", json={"portions": 4, "selected": ids}).get_json()
        self.assertEqual(added["added"], len(ids))
        self.assertEqual(sorted(l["id"] for l in added["cart"]["lines"]), sorted(ids))
        self.assertEqual(self.client.get("/api/recipes?category=recipe_cattree_vegan").status_code, 200)

    def test_recipe_input_is_checked(self):
        recipe_id = self.client.get("/api/recipes").get_json()["recipes"][0]["id"]
        bad = [
            self.client.get("/api/recipes?category=..%2F..%2Fetc"),
            self.client.get("/api/recipes/not-a-recipe"),
            self.client.get(f"/api/recipes/{recipe_id}?portions=abc"),
            self.client.get(f"/api/recipes/{recipe_id}?portions=99"),
            self.client.post(f"/api/recipes/{recipe_id}/add", json={"portions": "4", "selected": []}),
            self.client.post(f"/api/recipes/{recipe_id}/add", json={"selected": "s1019"}),
            self.client.post(f"/api/recipes/{recipe_id}/add", json={"selected": [1, 2]}),
            self.client.get("/api/raw-page/bad%20name"),
        ]
        self.assertEqual([r.status_code for r in bad], [400] * len(bad))
        self.assertEqual(self.client.get("/api/cart").get_json()["count"], 0)

    def test_raw_page_download(self):
        response = self.client.get("/api/raw-page/cookbook-page-content")
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response.headers["Content-Disposition"])
        self.assertIn("recipe_tile", response.get_data(as_text=True))

    def test_pictures(self):
        product = self.client.get("/api/search?q=tofu").get_json()["products"][0]
        picture = self.client.get(f"/api/image/{product['image']}")
        self.assertEqual((picture.status_code, picture.mimetype), (200, "image/svg+xml"))
        self.assertEqual(picture.headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("default-src 'none'", picture.headers["Content-Security-Policy"])
        recipe = self.client.get("/api/recipes").get_json()["recipes"][0]
        self.assertEqual(self.client.get(f"/api/image/{recipe['image']}").status_code, 200)
        for ref in ("recipes/../../etc/passwd", "..%2F..%2Fetc%2Fpasswd", "a/b/cccccccccc", "unknownunknownunknown"):
            self.assertEqual(self.client.get(f"/api/image/{ref}").status_code, 404, ref)

    def test_shortcuts_saved_history_selfcheck(self):
        self.assertEqual(len(self.client.get("/api/shortcuts").get_json()["shortcuts"]), 6)
        saved = self.client.post("/api/shortcuts", json={"shortcuts": [{"label": "Tofu", "query": "tofu"}]}).get_json()
        self.assertEqual(saved["shortcuts"], [{"label": "Tofu", "query": "tofu"}])
        self.assertEqual(len(self.client.post("/api/shortcuts", json={}).get_json()["shortcuts"]), 6)
        self.assertEqual(self.client.post("/api/saved/toggle", json={"id": "s1", "name": "A"}).get_json()["products"][0]["id"], "s1")
        self.assertEqual(self.client.post("/api/saved/toggle", json={}).status_code, 400)
        self.assertEqual(self.client.get("/api/history").get_json()["deliveries"], 4)
        checks = self.client.get("/api/selfcheck").get_json()["checks"]
        self.assertTrue(all(check["ok"] for check in checks), checks)

    def test_sign_out(self):
        self.assertFalse(self.client.post("/api/logout").get_json()["logged_in"])
        self.assertEqual(self.client.get("/api/cart").status_code, 401)
        self.assertFalse((self.data / "auth.json").exists())

    def test_static_files_stay_inside_the_folder(self):
        self.assertEqual(self.status("/static/app.js"), 200)
        for path in ("/static/../desk.py", "/static/..%2Fdesk.py", "/static/%2e%2e/server.py"):
            self.assertEqual(self.status(path), 404, path)


class IngressOnly(ServerCase):
    extra_env = {"INGRESS_ONLY": "1"}

    def test_only_the_home_assistant_gateway_may_connect(self):
        self.assertEqual(self.status("/"), 403)
        self.assertEqual(self.status("/api/state"), 403)
        self.assertEqual(self.status("/api/state", environ_overrides={"REMOTE_ADDR": "192.168.1.50"}), 403)
        self.assertEqual(self.status("/", environ_overrides=GATEWAY), 200)
        self.assertEqual(self.status("/api/state", environ_overrides=GATEWAY), 200)

    def test_a_forwarded_header_does_not_get_around_it(self):
        response = self.client.get("/api/state", headers={"X-Forwarded-For": "172.30.32.2"})
        self.assertEqual(response.status_code, 403)


class Page(unittest.TestCase):
    """Behind Home Assistant ingress the page lives under a path prefix, so
    every address it uses must be relative."""

    def test_no_absolute_addresses(self):
        html = (APP / "static" / "index.html").read_text(encoding="utf-8")
        script = (APP / "static" / "app.js").read_text(encoding="utf-8")
        css = (APP / "static" / "app.css").read_text(encoding="utf-8")
        self.assertEqual(re.findall(r'(?:href|src|action)="/[^"]*"', html), [])
        self.assertEqual(re.findall(r'(?:href|src)="https?:[^"]*"', html), [], "the page loads nothing from other sites")
        self.assertEqual(re.findall(r"""["'`]/(?:api|static)/""", script), [])
        self.assertEqual(re.findall(r"url\(", css), [])
        self.assertGreater(len(re.findall(r"""["'`]api/""", script)), 15)

    def test_page_text_is_never_built_from_markup(self):
        script = (APP / "static" / "app.js").read_text(encoding="utf-8")
        # Product and recipe names come from Picnic; they must go in as text.
        self.assertEqual(re.findall(r"\.innerHTML\s*=(?!\s*STAR\b)", script), [])
        self.assertNotIn("insertAdjacentHTML", script)
        self.assertNotIn("document.write", script)


if __name__ == "__main__":
    unittest.main()
