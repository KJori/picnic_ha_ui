"""Demo mode: a fake Picnic that never touches the network.

Start the server with PICNIC_DEMO=1 to try the UI without an account. The fake
subclasses the real client and only replaces the HTTP calls, so the library's
own parsing and everything in desk.py run exactly as they do against Picnic.

Any email and password sign in. Use the password "2fa" to walk through the
verification-code step; the code is 123456.

The recipe pages are built in the shapes described by MRVDH/picnic-api and
ivo-toby/mcp-picnic, so recipes.py reads them the same way it reads Picnic's.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import math
from urllib.parse import parse_qs, urlparse

from python_picnic_api2 import PicnicAPI
from python_picnic_api2 import client as picnic_client
from python_picnic_api2.session import Picnic2FAError

# The newer app version desk.py presents for pages; see PAGE_AGENT there.
NEWER_AGENT = "30100;1.246.1-15599;"

# id, name, unit, price in cents, optional promo price, optional label
CATALOGUE = [
    ("s1001", "Picnic havermelk barista", "1 liter", 139, None, None),
    ("s1002", "Oatly haverdrank barista edition", "1 liter", 229, 199, "Actie"),
    ("s1003", "Alpro sojadrink ongezoet", "1 liter", 189, None, None),
    ("s1004", "Picnic tofu naturel", "375 gram", 179, None, None),
    ("s1005", "Picnic tofu gerookt", "200 gram", 199, None, None),
    ("s1006", "Bananen", "5 stuks", 149, None, None),
    ("s1007", "Bananen biologisch", "5 stuks", 189, None, None),
    ("s1008", "Elstar appels", "1,5 kilo", 269, None, None),
    ("s1009", "Trostomaten", "500 gram", 159, None, None),
    ("s1010", "Komkommer", "1 stuk", 89, None, None),
    ("s1011", "Rode paprika", "3 stuks", 199, 169, "2e halve prijs"),
    ("s1012", "Broccoli", "500 gram", 129, None, None),
    ("s1013", "Zoete aardappel", "1 kilo", 219, None, None),
    ("s1014", "Uien", "1 kilo", 119, None, None),
    ("s1015", "Knoflook", "3 stuks", 99, None, None),
    ("s1016", "Picnic kikkererwten", "400 gram", 79, None, None),
    ("s1017", "Picnic zwarte bonen", "400 gram", 85, None, None),
    ("s1018", "Picnic linzen rood", "500 gram", 169, None, None),
    ("s1019", "Picnic volkoren penne", "500 gram", 99, None, None),
    ("s1020", "Picnic zilvervliesrijst", "1 kilo", 189, None, None),
    ("s1021", "Picnic havermout", "500 gram", 75, None, None),
    ("s1022", "Picnic pindakaas 100% pinda", "350 gram", 229, None, None),
    ("s1023", "Volkorenbrood heel", "800 gram", 199, None, None),
    ("s1024", "Picnic tomatenblokjes", "400 gram", 69, None, None),
    ("s1025", "Picnic kokosmelk", "400 milliliter", 119, None, None),
    ("s1026", "Picnic olijfolie extra vierge", "500 milliliter", 549, None, None),
    ("s1027", "Douwe Egberts aroma rood filterkoffie", "500 gram", 999, 799, "Actie"),
    ("s1028", "Picnic aromatico filterkoffie", "500 gram", 799, None, None),
    ("s1029", "Tony's Chocolonely puur 70%", "180 gram", 349, None, None),
    ("s1030", "Picnic hummus naturel", "200 gram", 129, None, None),
    ("s1031", "Picnic afwasmiddel", "500 milliliter", 99, None, None),
    ("s1032", "Picnic toiletpapier 3-laags", "12 rollen", 449, None, None),
]
UNAVAILABLE = {"s1007"}
# Bundle tiers: a lower price per unit from a certain quantity.
BUNDLES = {"s1024": [{"price": 69, "from_quantity": 1}, {"price": 59, "from_quantity": 4}]}
BY_ID = {row[0]: row for row in CATALOGUE}
PAST_ORDERS = [
    {"s1001": 2, "s1004": 2, "s1006": 1, "s1009": 1, "s1016": 3, "s1021": 1, "s1023": 1},
    {"s1001": 2, "s1004": 1, "s1006": 1, "s1012": 1, "s1019": 2, "s1024": 4, "s1028": 1},
    {"s1001": 3, "s1005": 1, "s1006": 1, "s1010": 2, "s1016": 2, "s1022": 1, "s1023": 1},
    {"s1003": 1, "s1004": 2, "s1008": 1, "s1014": 1, "s1020": 1, "s1029": 2, "s1032": 1},
]


# name, description, segment, categories, [(product id, units for 2 people, ticked by default)]
RECIPES = [
    ("Pasta met geroosterde paprika en kikkererwten", "Uit de oven, in een half uur op tafel.",
     ("THIS_WEEK_RECIPES", "Deze week"), ("20minuten", "vegan"),
     [("s1019", 1, True), ("s1011", 1, True), ("s1016", 1, True), ("s1024", 2, True),
      ("s1015", 1, False), ("s1026", 1, False)]),
    ("Tofu roerbak met broccoli en rijst", "Knapperige tofu met een snelle sojasaus.",
     ("THIS_WEEK_RECIPES", "Deze week"), ("20minuten", "vegan"),
     [("s1004", 1, True), ("s1012", 1, True), ("s1020", 1, True), ("s1015", 1, False)]),
    ("Zoete-aardappelcurry met kokosmelk", "Romige curry die vanzelf gaar wordt.",
     ("NEW_RECIPES", "NEW_RECIPES"), ("vegan",),
     [("s1013", 1, True), ("s1025", 1, True), ("s1016", 1, True), ("s1020", 1, True),
      ("s1014", 1, False)]),
    ("Linzensoep met tomaat", "Een pan soep voor twee dagen.",
     ("NEW_RECIPES", "NEW_RECIPES"), ("vegan",),
     [("s1018", 1, True), ("s1024", 2, True), ("s1014", 1, False), ("s1015", 1, False)]),
    ("Zwarte-bonenchili", "Met paprika, tomaat en rijst.",
     ("SAVED_RECIPES", "Bewaard"), ("vegan",),
     [("s1017", 2, True), ("s1024", 2, True), ("s1011", 1, True), ("s1020", 1, True),
      ("s1014", 1, False)]),
    ("Havermout met banaan en pindakaas", "Ontbijt in vijf minuten.",
     ("SAVED_RECIPES", "Bewaard"), ("20minuten",),
     [("s1021", 1, True), ("s1001", 1, True), ("s1007", 1, True), ("s1022", 1, False)]),
]


def _recipe_id(name: str) -> str:
    return hashlib.sha1(name.encode()).hexdigest()[:24]


RECIPE_BY_ID = {_recipe_id(row[0]): row for row in RECIPES}
RECIPE_IMAGES = {hashlib.sha256(row[0].encode()).hexdigest(): row for row in RECIPES}


def _rich(markdown: str, text_type: str | None = None) -> dict:
    node = {"type": "RICH_TEXT", "markdown": markdown}
    if text_type:
        node["textType"] = text_type
    return node


def _image_id(product_id: str) -> str:
    return hashlib.sha256(product_id.encode()).hexdigest()


def _tile_image_id(product_id: str) -> str:
    """The picture a search tile names. As in Picnic's own sample responses,
    for some products this is a different id than the product's image_id."""
    if int(product_id[1:]) % 2:
        return _image_id(product_id)
    return hashlib.sha256(("tile" + product_id).encode()).hexdigest()


def _second_image_id(product_id: str) -> str:
    return hashlib.sha256(("back" + product_id).encode()).hexdigest()


IMAGE_OWNERS = {_image_id(row[0]): row for row in CATALOGUE}
IMAGE_OWNERS.update({_tile_image_id(row[0]): row for row in CATALOGUE})
IMAGE_OWNERS.update({_second_image_id(row[0]): row for row in CATALOGUE})

# description, ingredients, allergens (contains, may contain), nutrition
PRODUCT_TEXT = {
    "s1001": ("Romige haverdrank die goed opschuimt in koffie.",
              "Water, **haver** (10%), raapzaadolie, calciumcarbonaat, zout, vitamine D2, B12.",
              (["Haver (gluten)"], []), "Energie 247 kJ / 59 kcal\nVetten 3,0 g\nKoolhydraten 6,6 g\nEiwitten 1,0 g"),
    "s1004": ("Stevige tofu om te bakken, grillen of roerbakken.",
              "Water, **soja**bonen (38%), stremsel: magnesiumchloride.",
              (["Soja"], []), "Energie 536 kJ / 128 kcal\nVetten 7,5 g\nKoolhydraten 1,0 g\nEiwitten 13,5 g"),
    "s1022": ("Pindakaas van alleen geroosterde pinda's.",
              "**Pinda's** (100%).",
              (["Pinda's"], ["Noten", "Sesam"]), "Energie 2590 kJ / 625 kcal\nVetten 51 g\nKoolhydraten 12 g\nEiwitten 26 g"),
    "s1019": ("Volkoren pasta van harde tarwe.",
              "Volkoren harde **tarwe**griesmeel.",
              (["Tarwe (gluten)"], ["Ei", "Soja"]), "Energie 1480 kJ / 350 kcal\nVetten 2,5 g\nKoolhydraten 64 g\nEiwitten 13 g"),
    "s1029": ("Pure chocolade met 70% cacao.",
              "Cacaomassa, suiker, cacaoboter, emulgator: **soja**lecithine.",
              (["Soja"], ["Melk", "Noten", "Pinda's"]), "Energie 2330 kJ / 560 kcal\nVetten 41 g\nKoolhydraten 33 g\nEiwitten 8 g"),
}
NO_INGREDIENTS = {"s1031", "s1032"}  # household products


def _iso(moment: dt.datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%S.000+02:00")


class DemoPicnicAPI(PicnicAPI):
    def __init__(self, country_code="NL", auth_token=None, **_):
        super().__init__(country_code=country_code, auth_token=auth_token)
        self._basket: dict[str, int] = {}
        self._links: set[str] = set()  # products that are in the basket for a recipe

    # ------------------------------------------------------------- payloads

    def _article(self, product_id: str, qty: int) -> dict:
        _, name, unit, price, promo, _ = BY_ID[product_id]
        return {
            "type": "ORDER_ARTICLE",
            "id": product_id,
            "name": name,
            "image_ids": [_image_id(product_id)],
            "unit_quantity": unit,
            "price": promo or price,
            "max_count": 99,
            "decorators": [{"type": "QUANTITY", "quantity": qty}],
            "selling_unit_contexts_for_mutations": [],
        }

    def _lines(self, basket: dict[str, int]) -> list[dict]:
        lines = []
        for index, (product_id, qty) in enumerate(basket.items()):
            price = BY_ID[product_id][4] or BY_ID[product_id][3]
            lines.append(
                {
                    "type": "ORDER_LINE",
                    "id": str(index),
                    "items": [self._article(product_id, qty)],
                    "display_price": price * qty,
                    "price": price * qty,
                }
            )
        return lines

    def _cart_payload(self) -> dict:
        lines = self._lines(self._basket)
        total = sum(line["price"] for line in lines)
        tomorrow = (dt.datetime.now() + dt.timedelta(days=1)).replace(
            minute=0, second=0, microsecond=0
        )
        slots = []
        for index, hour in enumerate((8, 12, 17, 19)):
            start = tomorrow.replace(hour=hour)
            slots.append(
                {
                    "slot_id": f"slot{index}",
                    "window_start": _iso(start),
                    "window_end": _iso(start + dt.timedelta(hours=1)),
                    "cut_off_time": _iso(tomorrow.replace(hour=0) - dt.timedelta(hours=2)),
                    "is_available": index != 1,
                    "selected": False,
                    "minimum_order_value": 4000,
                }
            )
        return {
            "type": "ORDER",
            "id": "mock",
            "items": lines,
            "delivery_slots": slots,
            "selected_slot": {"slot_id": "slot2", "state": "IMPLICIT"},
            "total_count": sum(self._basket.values()),
            "total_price": total,
            "checkout_total_price": total,
            "analytics_context_data": {
                "items_list": [
                    {"product_id": product_id, "quantity": qty, "is_available": True,
                     "is_in_recipe": product_id in self._links}
                    for product_id, qty in self._basket.items()
                ]
            },
        }

    def _search_payload(self, term: str) -> dict:
        words = term.lower().split()
        tiles = []
        for product_id, name, unit, price, promo, label in CATALOGUE:
            if not all(word in name.lower() for word in words):
                continue
            decorators = []
            if label:
                decorators.append({"type": "LABEL", "text": label})
            if product_id in UNAVAILABLE:
                decorators.append(
                    {
                        "type": "UNAVAILABLE",
                        "reason": "OUT_OF_STOCK",
                        "deeplink": "",
                        "explanation": {
                            "short_explanation": "Tijdelijk uitverkocht",
                            "long_explanation": "Dit product is tijdelijk niet leverbaar.",
                        },
                    }
                )
            tiles.append(
                {
                    "type": "SELLING_UNIT_TILE",
                    "sellingUnit": {
                        "id": product_id,
                        "name": name,
                        "display_price": promo or price,
                        "image_id": _image_id(product_id),
                        "unit_quantity": unit,
                        "max_count": 99,
                        "decorators": decorators,
                        "price_ranges": BUNDLES.get(product_id),
                    },
                    "sellingUnitImageConfiguration": {
                        "derivativeType": "padded", "extension": "webp", "id": _tile_image_id(product_id),
                    },
                }
            )
        return {"body": {"child": {"children": tiles}}}

    def _delivery_payload(self, index: int) -> dict:
        when = (dt.datetime.now() - dt.timedelta(days=7 * (index + 1))).replace(
            hour=17, minute=0, second=0, microsecond=0
        )
        return {
            "type": "DELIVERY",
            "delivery_id": f"d{index}",
            "creation_time": _iso(when - dt.timedelta(days=1)),
            "slot": {"slot_id": f"past{index}", "window_start": _iso(when)},
            "status": "COMPLETED",
            "orders": [{"type": "ORDER", "id": f"o{index}", "items": self._lines(PAST_ORDERS[index])}],
        }

    # --------------------------------------------------------------- product

    @staticmethod
    def _product_payload(product_id: str) -> dict:
        """A product page in the shape of python-picnic-api2's sample pages.
        The allergens, fold-out sections and picture gallery (the parts named in
        MRVDH/picnic-api) are only served to the newer app version, so that the
        second request in desk.py's product() is exercised."""
        if product_id not in BY_ID:
            return {"error": {"code": "NOT_FOUND", "message": "Product niet gevonden"}}
        _, name, unit, price, promo, _ = BY_ID[product_id]
        brand, _, title = name.partition(" ") if name.startswith(("Picnic ", "Oatly ", "Alpro ")) else ("", "", name)
        pml = lambda container_id, children: {  # noqa: E731
            "type": "PML", "id": container_id, "pml": {"component": {"type": "STACK", "children": children}}}
        main = [{"type": "CONTAINER", "child": {"markdown": f"#(#333333){title[:1].upper() + title[1:]}#(#333333)",
                                                "textType": "HEADER1", "type": "RICH_TEXT"}}]
        if brand:
            main.append({"markdown": brand, "textAttributes": {"weight": "REGULAR"}, "type": "RICH_TEXT"})
        main.append({"type": "STACK", "children": [
            {"markdown": f"#(#333333){unit}#(#333333)", "type": "RICH_TEXT"},
            {"markdown": "€%d.%02d/stuk" % divmod(promo or price, 100), "type": "RICH_TEXT"},
        ]})
        prices = [{"price": promo or price, "type": "PRICE"}]
        if promo:
            prices.append({"price": price, "isCrossed": True, "type": "PRICE"})
        main.append({"type": "STACK", "children": prices})

        description, ingredients, (contains, may_contain), nutrition = PRODUCT_TEXT.get(
            product_id, (f"{name}, {unit}.", "Zie de verpakking.", ([], []), ""))
        children = [
            pml("product-details-page-root-main-container", main),
            {"type": "image_gallery", "image_id": _image_id(product_id)},
            pml("product-page-description", [_rich(description)]),
            pml("product-page-highlights", [_rich("**Elke dag** lage prijs"), _rich(unit)]),
        ]
        if picnic_client._HEADERS.get("x-picnic-agent") == NEWER_AGENT:
            if contains or may_contain:
                texts = (["Bevat", *contains] if contains else []) + (["Bevat mogelijk", *may_contain] if may_contain else [])
                children.append(pml("product-page-allergies", [_rich(text) for text in texts]))
            if product_id not in NO_INGREDIENTS:
                items = [{"header": _rich("**Ingrediënten**"), "body": {"type": "STACK", "children": [_rich(ingredients)]}}]
                if nutrition:
                    items.append({"header": _rich("**Voedingswaarde**"),
                                  "body": {"type": "STACK", "children": [_rich("Per 100 g"), _rich(nutrition)]}})
                items.append({"header": _rich("**Extra informatie**"),
                              "body": {"type": "STACK", "children": [_rich("Koel en droog bewaren.")]}})
                children.append({"type": "PML", "id": "accordion-list",
                                 "pml": {"component": {"type": "ACCORDION", "items": items}}})
            children.append(pml("product-page-image-gallery-main-image-container", [
                {"type": "IMAGE", "source": {"id": _image_id(product_id)}, "derivativeType": "padded", "extension": "webp"},
                {"type": "IMAGE", "source": {"id": _second_image_id(product_id)}, "derivativeType": "padded", "extension": "webp"},
            ]))
        return {"body": {"child": {"child": {"children": children}}}}

    # --------------------------------------------------------------- recipes

    @staticmethod
    def _units(recipe_id: str, portions: int) -> list[dict]:
        units = []
        for product_id, count, ticked in RECIPE_BY_ID[recipe_id][4]:
            units.append(
                {
                    "ingredient_id": hashlib.md5((recipe_id + product_id).encode()).hexdigest(),
                    "selling_unit_id": product_id,
                    "quantity": max(1, math.ceil(count * portions / 2)),
                    "checked": ticked,
                    "status": "UNAVAILABLE" if product_id in UNAVAILABLE else "ACTIVE",
                    "swap_type": None,
                }
            )
        return units

    @staticmethod
    def _recipe_tile(recipe_id: str) -> dict:
        name, _, (segment, segment_name), _, _ = RECIPE_BY_ID[recipe_id]
        target = f"app.picnic://store/page;id=selling-group-details-page,selling_group_id={recipe_id}"
        return {
            "type": "PML",
            "id": f"recipe-tile-{recipe_id}",
            "analytics": {
                "contexts": [
                    {"schema": "iglu:tech.picnic.snowplow.analytics/pml_component/jsonschema/1-0-0",
                     "data": {"type": "recipe_tile", "template_id": "cookbook-recipe-tile"}},
                    {"schema": "iglu:tech.picnic.snowplow.analytics/segment/jsonschema/1-0-0",
                     "data": {"segment_name": segment_name, "segment_type": segment}},
                ]
            },
            "pml": {
                "component": {
                    "type": "TOUCHABLE",
                    "onPress": {"type": "EXPRESSION",
                                "expression": f'onPMLAction({{ actionType: "OPEN", target: "{target}" }})'},
                    "child": {
                        "type": "STACK",
                        "children": [
                            {"type": "IMAGE", "source": {"id": hashlib.sha256(name.encode()).hexdigest(), "namespace": "recipes"}},
                            _rich(f"#(#333333){name}#(#333333)", "SUBTITLE1"),
                            _rich("25 min"),
                            _rich("Toevoegen"),
                        ],
                    },
                }
            },
        }

    def _recipe_list_payload(self, category: str | None) -> dict:
        ids = [rid for rid, row in RECIPE_BY_ID.items() if category is None or category in row[3]]
        links = [
            {"type": "TOUCHABLE", "onPress": {"target": f"app.picnic://store/page;id=recipe_cattree_{slug}"}}
            for slug in ("20minuten", "vegan")
        ]
        children = [self._recipe_tile(rid) for rid in ids] + (links if category is None else [])
        return {"id": "cookbook", "body": {"type": "STATE_BOUNDARY", "child": {"type": "BLOCK", "children": children}}}

    def _recipe_detail_payload(self, recipe_id: str, portions: int | None) -> dict:
        if recipe_id not in RECIPE_BY_ID:
            return {"error": {"code": "NOT_FOUND", "message": "Recept niet gevonden"}}
        name, description, _, _, _ = RECIPE_BY_ID[recipe_id]
        portions = portions or 2
        units = self._units(recipe_id, portions)
        tiles = []
        for unit in units:
            _, product, pack, price, promo, _ = BY_ID[unit["selling_unit_id"]]
            tiles.append(
                {
                    "type": "PML",
                    "id": f"selling-unit-tile-{unit['ingredient_id']}",
                    "analytics": {"contexts": [
                        {"schema": "iglu:tech.picnic.snowplow.analytics/product/jsonschema/1-0-0",
                         "data": {"product_id": unit["selling_unit_id"]}}]},
                    "pml": {"component": {"type": "STACK", "children": [
                        {"type": "IMAGE", "source": {"id": _image_id(unit["selling_unit_id"])}},
                        _rich(product, "SUBTITLE1"),
                        _rich(pack),
                        _rich("%d.%02d" % divmod(promo or price, 100)),
                        _rich("Toevoegen"),
                    ]}},
                }
            )
        suspense = lambda parameters: {"type": "SUSPENSE", "pageConfig": {"id": "selling-group-x", "parameters": parameters}}  # noqa: E731
        children = [
            suspense({"selling_group_title_section_data": {"name": name, "description": description}}),
            suspense({"selling_group_image_data": {"images": {"images": [
                {"id": hashlib.sha256(name.encode()).hexdigest(), "namespace": "recipes", "primary": True}]}}}),
            suspense({"selling_group_header_data": {"is_saved": False, "default_portions": 2, "creator_type": "PIM", "sellable_name": name}}),
            {"type": "PML", "analytics": {"contexts": [
                {"schema": "iglu:tech.picnic.snowplow.analytics/recipe/jsonschema/1-6-0",
                 "data": {"recipe_id": recipe_id, "recipe_name": name, "portions": portions, "selling_units": units}}]}},
            *tiles,
        ]
        return {"id": "selling-group-details-page-root", "body": {"type": "STATE_BOUNDARY", "child": {"type": "BLOCK", "children": children}}}

    def _assign_recipe(self, payload: dict) -> dict:
        recipe_id = payload.get("selling_group_id")
        if recipe_id not in RECIPE_BY_ID:
            return {"error": {"code": "NOT_FOUND", "message": "Recept niet gevonden"}}
        missing = False
        for unit in self._units(recipe_id, payload.get("portions") or 2):
            product_id = unit["selling_unit_id"]
            if unit["status"] != "ACTIVE":
                missing = True
                continue
            if not unit["checked"]:
                continue
            self._basket[product_id] = min(99, self._basket.get(product_id, 0) + unit["quantity"])
            self._links.add(product_id)
        return {"anyUnavailableIngredient": missing, "assignedNumberOfPortions": payload.get("portions") or 2, "cart": {}}

    # ----------------------------------------------------------- HTTP stubs

    def _get(self, path: str, add_picnic_headers=False):
        parsed = urlparse(path)
        if parsed.path == "/user":
            return {"user_id": "mock", "firstname": "Demo"}
        if parsed.path == "/pages/search-page-results":
            return self._search_payload(parse_qs(parsed.query).get("search_term", [""])[0])
        if parsed.path == "/cart":
            return self._cart_payload()
        if parsed.path == "/pages/product-details-page-root":
            return self._product_payload(parse_qs(parsed.query).get("id", [""])[0])
        if parsed.path == "/pages/cookbook-page-content":
            return self._recipe_list_payload(None)
        if parsed.path.startswith("/pages/recipe_cattree_"):
            return self._recipe_list_payload(parsed.path.rsplit("_", 1)[1])
        if parsed.path == "/pages/selling-group-details-page":
            query = parse_qs(parsed.query)
            portions = query.get("portions", [None])[0]
            return self._recipe_detail_payload(query.get("selling_group_id", [""])[0], int(portions) if portions else None)
        if parsed.path.startswith("/pages/"):
            return {"error": {"code": "NOT_FOUND", "message": "page-template was not found"}}
        if parsed.path.startswith("/deliveries/"):
            return self._delivery_payload(int(parsed.path.rsplit("/d", 1)[1]))
        raise NotImplementedError(path)

    def _post(self, path: str, data=None, base_url_override=None, add_picnic_headers=False):
        if path == "/user/login":
            self.session._update_auth_token("mock-token")
            if data and data.get("secret") == hashlib.md5(b"2fa").hexdigest():
                return {"second_factor_authentication_required": True}
            return {"user_id": "mock"}
        if path == "/cart/add_product":
            if data["product_id"] not in BY_ID or data["product_id"] in UNAVAILABLE:
                return {"error": {"code": "UNPROCESSABLE", "message": "Dit product is nu niet leverbaar."}}
            current = self._basket.get(data["product_id"], 0)
            self._basket[data["product_id"]] = min(99, current + data["count"])
            return self._cart_payload()
        if path == "/cart/remove_product":
            left = self._basket.get(data["product_id"], 0) - data["count"]
            if left > 0:
                self._basket[data["product_id"]] = left
            else:
                self._basket.pop(data["product_id"], None)
                self._links.discard(data["product_id"])
            return self._cart_payload()
        if path == "/pages/task/assign-selling-group-to-basket":
            return self._assign_recipe((data or {}).get("payload") or {})
        if path == "/cart/clear":
            self._basket.clear()
            self._links.clear()
            return self._cart_payload()
        if path == "/deliveries/summary":
            return [
                {key: value for key, value in self._delivery_payload(i).items() if key != "orders"}
                for i in range(len(PAST_ORDERS))
            ]
        raise NotImplementedError(path)

    def _post_2fa(self, path: str, data=None):
        if path == "/user/2fa/verify" and (data or {}).get("otp") != "123456":
            raise Picnic2FAError("Invalid code", code="INVALID_OTP")
        return None

    # --------------------------------------------------------------- images

    def demo_image(self, image_id: str) -> bytes | None:
        if image_id.startswith("recipes/"):
            row = RECIPE_IMAGES.get(image_id.split("/", 1)[1])
            if row is None:
                return None
            hue = int(image_id[8:12], 16) % 360
            dots = "".join(
                f'<circle cx="{40 + 55 * i}" cy="{70 + 30 * (i % 2)}" r="{34 - 4 * i}" '
                f'fill="hsl({(hue + 40 * i) % 360} 55% {58 + 6 * i}%)"/>'
                for i in range(4)
            )
            return (
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180">'
                f'<rect width="240" height="180" fill="hsl({hue} 40% 88%)"/>{dots}</svg>'
            ).encode()
        row = IMAGE_OWNERS.get(image_id)
        if row is None:
            return None
        hue = int(image_id[:4], 16) % 360
        letter = row[1].replace("Picnic ", "")[0].upper()
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">'
            f'<rect width="120" height="120" fill="hsl({hue} 45% 90%)"/>'
            f'<circle cx="60" cy="62" r="38" fill="hsl({hue} 50% 62%)"/>'
            f'<text x="60" y="78" font-family="sans-serif" font-size="44" font-weight="700" '
            f'text-anchor="middle" fill="hsl({hue} 60% 22%)">{letter}</text></svg>'
        )
        return svg.encode()
