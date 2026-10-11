"""Checks for the product page reader.

The first sample is python-picnic-api2's own. The fold-out sections, allergens
and gallery are written in the shape MRVDH/picnic-api's reader expects, since
no captured sample of those parts exists.

Run from the repository root:  python -m unittest discover tests
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "picnic_desk" / "app"))

from products import parse_extras, plain  # noqa: E402

SAMPLE = Path(__file__).parent / "fixtures" / "picnic" / "product_details_page_nl.json"
EMPTY = {"description": "", "highlights": [], "allergens": [], "sections": [], "pictures": []}


def rich(markdown):
    return {"type": "RICH_TEXT", "markdown": markdown}


def block(container_id, children, **component):
    return {"type": "PML", "id": container_id, "pml": {"component": {"type": "STACK", "children": children, **component}}}


def page(*children):
    return {"layout": {"body": {"child": {"children": list(children)}}}}


class ProductExtras(unittest.TestCase):
    def test_library_sample_page(self):
        extras = parse_extras(json.loads(SAMPLE.read_text(encoding="utf-8")))
        self.assertEqual(extras["description"], "Onze aromatische filterkoffie met een volle smaak en een aangenaam aroma.")
        self.assertEqual(extras["highlights"], ["**Volle** smaak", "Snelfiltermaling"])
        self.assertEqual(extras["pictures"], [{"ref": "1be1d07e57ea3991445a91960535a2b4593caf75c7e157a42a19ba61aaf00000", "variant": None}])
        self.assertEqual((extras["allergens"], extras["sections"]), ([], []))

    def test_fold_out_sections(self):
        accordion = {"type": "PML", "id": "accordion-list", "pml": {"component": {"type": "ACCORDION", "items": [
            {"header": {"child": rich("#(#333333)**Ingrediënten**#(#333333)")},
             "body": {"children": [rich("Water, **soja**bonen (18%), zout."), rich("Kan sporen van noten bevatten.")]}},
            {"header": rich("**Voedingswaarde**"), "body": rich("Energie 536 kJ\nVetten 7,5 g")},
            {"header": rich(""), "body": rich("zonder titel")},
            {"header": rich("Leeg"), "body": {"children": []}},
            "not a dict",
        ]}}}
        self.assertEqual(
            parse_extras(page(accordion))["sections"],
            [
                {"title": "Ingrediënten", "text": "Water, **soja**bonen (18%), zout.\nKan sporen van noten bevatten."},
                {"title": "Voedingswaarde", "text": "Energie 536 kJ\nVetten 7,5 g"},
            ],
        )

    def test_allergens_grouped_under_their_headings(self):
        allergies = block("product-page-allergies", [
            rich("**Bevat**"), rich("#(#333333)Soja#(#333333)"), rich("Tarwe (gluten), Selderij"),
            rich("Bevat mogelijk:"), rich("Noten"), rich("Noten"),
        ])
        self.assertEqual(
            parse_extras(page(allergies))["allergens"],
            [{"label": "Bevat", "items": ["Soja", "Tarwe (gluten)", "Selderij"]}, {"label": "Bevat mogelijk", "items": ["Noten"]}],
        )
        loose = block("product-page-allergies", [rich("Melk"), rich("Ei")])
        self.assertEqual(parse_extras(page(loose))["allergens"], [{"label": "", "items": ["Melk", "Ei"]}])
        german = block("product-page-allergies", [rich("Enthält"), rich("Soja"), rich("Kann Spuren enthalten von"), rich("Nüsse")])
        self.assertEqual([g["label"] for g in parse_extras(page(german))["allergens"]], ["Enthält", "Kann Spuren enthalten von"])
        self.assertEqual(parse_extras(page(block("product-page-allergies", [rich("Bevat")])))["allergens"], [])

    def test_gallery_pictures_with_the_variant_picnic_names(self):
        gallery = block("product-page-image-gallery-main-image-container", [
            {"type": "IMAGE", "source": {"id": "a" * 64}, "derivativeType": "padded", "extension": "webp"},
            {"type": "IMAGE", "source": {"id": "b" * 64}},
            {"type": "IMAGE", "source": {"id": "a" * 64}},
            {"type": "IMAGE", "source": {"id": "../../etc"}},
            {"type": "ICON", "source": {"id": "c" * 64}},
        ])
        elsewhere = {"type": "IMAGE", "source": {"id": "d" * 64}}
        self.assertEqual(
            parse_extras(page(elsewhere, gallery))["pictures"],
            [{"ref": "a" * 64, "variant": "padded.webp"}, {"ref": "b" * 64, "variant": None}],
        )

    def test_description_under_either_name(self):
        self.assertEqual(parse_extras(page(block("description", [rich("Eerste regel"), rich("Tweede")])))["description"], "Eerste regel\nTweede")
        self.assertEqual(parse_extras(page(block("product-page-description", [rich("A")])))["description"], "A")

    def test_unknown_pages(self):
        for junk in (None, {}, [], "text", {"body": {"children": [rich("Hallo")]}}, page(block("something-else", [rich("x")]))):
            self.assertEqual(parse_extras(junk), EMPTY, junk)

    def test_plain_text(self):
        self.assertEqual(plain("#(#B40117)**Let op**#(#B40117)  twee   spaties hier \n  regel 2 "), "**Let op** twee spaties hier\nregel 2")
        self.assertEqual(plain("#(GREEN1)ok#(GREEN1)"), "ok")


if __name__ == "__main__":
    unittest.main()
