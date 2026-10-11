"""Checks for the recipe page reader.

The sample pages mirror the shapes used in the tests of MRVDH/picnic-api and
ivo-toby/mcp-picnic, which were written against the live service.

Run from the repository root:  python -m unittest discover tests
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "picnic_desk" / "app"))

from recipes import parse_detail, parse_list  # noqa: E402

RECIPE = "0123456789abcdef01234567"
OWN = "fedcba9876543210fedcba9876543210"
NEW = "aaaaaaaaaaaaaaaaaaaaaaaa"
SEEN_MORE = "bbbbbbbbbbbbbbbbbbbbbbbb"


def rich(markdown, text_type=None):
    node = {"type": "RICH_TEXT", "markdown": markdown}
    if text_type:
        node["textType"] = text_type
    return node


def open_action(recipe_id):
    return {
        "type": "EXPRESSION",
        "expression": 'onPMLAction({ actionType: "OPEN", target: "app.picnic://store/page;'
        f'id=selling-group-details-page,selling_group_id={recipe_id}" }})',
    }


def cookbook_tile(recipe_id, name, segment, image_id):
    return {
        "type": "PML",
        "id": f"tile-{recipe_id}",
        "analytics": {
            "contexts": [
                {"data": {"type": "recipe_tile", "template_id": "cookbook-recipe-tile"}, "schema": "iglu:x/pml_component/1"},
                {"data": {"segment_name": segment[1], "segment_type": segment[0]}, "schema": "iglu:x/segment/1"},
            ]
        },
        "pml": {
            "component": {
                "type": "TOUCHABLE",
                "onPress": open_action(recipe_id),
                "child": {
                    "type": "STACK",
                    "children": [
                        {"type": "IMAGE", "source": {"id": image_id, "namespace": "recipes"}},
                        rich(f"#(#333333){name}#(#333333)"),
                        rich("20 min"),
                        rich("Toevoegen"),
                    ],
                },
            }
        },
    }


def own_tile(recipe_id, name):
    return {
        "type": "CONTAINER",
        "analytics": {
            "contexts": [
                {"data": {"type": "recipe_tile_mini", "template_id": "core-uds-recipe-tile"}, "schema": "iglu:x/pml_component/1"},
                {"data": {"recipe_id": recipe_id, "recipe_image_type": "GALLERY", "recipe_name": name}, "schema": "iglu:x/recipe/1"},
                {"data": {"segment_name": "Eigen recepten", "segment_type": "USER_DEFINED_RECIPES"}, "schema": "iglu:x/segment/1"},
            ]
        },
        "child": {"type": "TOUCHABLE", "onPress": open_action(recipe_id)},
    }


def page(children):
    return {"id": "p", "body": {"type": "STATE_BOUNDARY", "child": {"type": "BLOCK", "children": children}}}


class ListPages(unittest.TestCase):
    def test_tiles_segments_and_categories(self):
        shelf = {
            "type": "SHELF",
            "analytics": {"contexts": [{"data": {"segment_name": "Deze week", "segment_type": "THIS_WEEK_RECIPES"}}]},
            "seeMore": f"app.picnic://store/page;id=recipe-list,recipeIds={SEEN_MORE}",
        }
        link = {"type": "TOUCHABLE", "onPress": {"target": "app.picnic://store/page;id=recipe_cattree_20minuten"}}
        other = {"type": "TOUCHABLE", "onPress": {"target": "app.picnic://store/page;id=recipe-cattree-jamie-oliver"}}
        result = parse_list(
            page(
                [
                    cookbook_tile(RECIPE, "Gyros-rijstpan met feta", ("SAVED_RECIPES", "Bewaard"), "abc"),
                    own_tile(OWN, "Mijn recept"),
                    cookbook_tile(NEW, "Nieuw recept", ("NEW_RECIPES", "NEW_RECIPES"), "ghi"),
                    shelf,
                    link,
                    other,
                ]
            )
        )
        by_id = {recipe["id"]: recipe for recipe in result["recipes"]}
        self.assertEqual(
            by_id[RECIPE],
            {"id": RECIPE, "name": "Gyros-rijstpan met feta", "image": "recipes/abc", "segments": ["SAVED_RECIPES"]},
        )
        self.assertEqual(by_id[OWN]["name"], "Mijn recept")
        self.assertEqual(by_id[OWN]["segments"], ["USER_DEFINED_RECIPES"])
        self.assertEqual(by_id[NEW]["image"], "recipes/ghi")
        self.assertEqual(by_id[SEEN_MORE]["segments"], ["THIS_WEEK_RECIPES"])
        self.assertIn({"id": "SAVED_RECIPES", "label": "Bewaard"}, result["segments"])
        self.assertIn({"id": "NEW_RECIPES", "label": "New recipes"}, result["segments"])
        self.assertEqual(
            result["categories"],
            [
                {"id": "recipe_cattree_20minuten", "label": "20 minuten"},
                {"id": "recipe-cattree-jamie-oliver", "label": "Jamie oliver"},
            ],
        )

    def test_name_hidden_in_script_text(self):
        tile = {
            "type": "PML",
            "analytics": {"contexts": [{"data": {"type": "recipe_tile_mini"}}]},
            "pml": {"onPress": open_action(OWN)},
            "state": 'track({"recipe_id":"' + OWN + '","recipe_image_type":"GALLERY","recipe_name":"Kaasplank"})',
        }
        self.assertEqual(parse_list(page([tile]))["recipes"][0]["name"], "Kaasplank")

    def test_page_without_recipes(self):
        self.assertEqual(parse_list(page([rich("Hallo")])), {"recipes": [], "segments": [], "categories": []})
        self.assertEqual(parse_list(None)["recipes"], [])


def product_tile(product_id, lines, image=None):
    children = [rich(*line) if isinstance(line, tuple) else rich(line) for line in lines]
    if image:
        children.insert(0, {"type": "IMAGE", "source": {"id": image}})
    return {
        "type": "PML",
        "analytics": {"contexts": [{"schema": "iglu:com.picnic/product/1-0-0", "data": {"product_id": product_id}}]},
        "pml": {"component": {"type": "STACK", "children": children}},
    }


def suspense(parameters):
    return {"type": "SUSPENSE", "suspenseId": "s", "pageConfig": {"id": "selling-group-x", "parameters": parameters}}


class DetailPages(unittest.TestCase):
    def detail(self, units=None):
        context = {
            "type": "PML",
            "analytics": {
                "contexts": [
                    {
                        "data": {
                            "recipe_id": RECIPE,
                            "recipe_name": "Rijstpan",
                            "portions": 2,
                            "selling_units": units
                            or [
                                {"ingredient_id": "i1", "selling_unit_id": "s1", "quantity": 2, "checked": True},
                                {"ingredient_id": "i2", "selling_unit_id": "s2", "quantity": 1, "checked": True, "status": "UNAVAILABLE"},
                                {"ingredient_id": "i3", "selling_unit_id": "s3", "quantity": 1, "checked": False},
                                {"ingredient_id": "i4", "selling_unit_id": "", "quantity": 1, "checked": True},
                            ],
                        }
                    }
                ]
            },
        }
        by_ingredient = {
            "type": "PML",
            "id": "selling-unit-tile-i3",
            "analytics": {"contexts": [{"data": {"recipe_id": RECIPE, "selling_units": [{"ingredient_id": "i3", "selling_unit_id": "s3"}]}}]},
            "pml": {"children": [rich("Voeg toe"), rich("Basmatirijst", "SUBTITLE1"), rich("1 pak"), rich("2,05 €")]},
        }
        return page(
            [
                suspense({"selling_group_title_section_data": {"name": "Rijstpan", "description": "Snel klaar."}}),
                suspense({"selling_group_image_data": {"images": {"images": [{"id": "x"}, {"id": "img1", "namespace": "recipes", "primary": True}]}}}),
                suspense({"selling_group_header_data": {"is_saved": True, "default_portions": 4}}),
                context,
                product_tile("s1", ["Paprika mix", "500 g", "€2,49", "Toevoegen"], image="p1"),
                product_tile("s2", ["-20%", "Tomaten", "1 stuk nodig", "1.19"]),
                by_ingredient,
            ]
        )

    def test_recipe_with_products(self):
        recipe = parse_detail(self.detail(), RECIPE)
        self.assertEqual(
            {key: recipe[key] for key in ("id", "name", "description", "portions", "default_portions", "image")},
            {"id": RECIPE, "name": "Rijstpan", "description": "Snel klaar.", "portions": 2, "default_portions": 4, "image": "recipes/img1"},
        )
        first, second, third = recipe["ingredients"]
        self.assertEqual(
            first,
            {"id": "s1", "ingredient_id": "i1", "qty": 2, "checked": True, "available": True,
             "name": "Paprika mix", "unit": "500 g", "price": 249, "image": "p1"},
        )
        self.assertEqual((second["name"], second["unit"], second["price"], second["available"]), ("Tomaten", "1 stuk nodig", 119, False))
        self.assertEqual((third["name"], third["unit"], third["price"], third["checked"]), ("Basmatirijst", "1 pak", 205, False))

    def test_single_product_recipe_does_not_take_the_page_as_its_tile(self):
        recipe = parse_detail(self.detail([{"ingredient_id": "i9", "selling_unit_id": "s9", "quantity": 1, "checked": True}]), RECIPE)
        self.assertEqual(recipe["ingredients"][0]["name"], None)

    def test_plain_data_shape(self):
        # The shape MRVDH's client tests use: bare data objects, no analytics wrapper.
        body = {
            "children": [
                {"data": {"creator_type": "USER", "default_portions": 2, "is_saved": False, "sellable_name": "Avocadopasta"}},
                {"data": {"image_type": "SUGGESTED", "portions": 4, "recipe_id": OWN, "recipe_name": "Avocadopasta",
                          "selling_units": [{"checked": True, "ingredient_id": "a", "quantity": 1, "selling_unit_id": "s1143210", "status": "ACTIVE"}]}},
                {"id": "selling-group-details-image", "child": {"type": "IMAGE", "source": {"id": "recipes/zzz"}}},
            ]
        }
        recipe = parse_detail({"layout": {"body": body}}, OWN)
        self.assertEqual((recipe["name"], recipe["portions"], recipe["default_portions"], recipe["image"]), ("Avocadopasta", 4, 2, "recipes/zzz"))
        self.assertEqual(recipe["ingredients"][0]["id"], "s1143210")

    def test_unrecognised_page(self):
        self.assertIsNone(parse_detail(page([rich("Hallo")]), RECIPE))
        self.assertIsNone(parse_detail(self.detail(), "c" * 24))


if __name__ == "__main__":
    unittest.main()
