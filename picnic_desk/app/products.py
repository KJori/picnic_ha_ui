"""Read the parts of Picnic's product page that the library does not.

python-picnic-api2 reads a product's name, brand, pack size, prices, first
picture, description and highlights. This module adds what a shopper checks
before buying: allergens, the fold-out sections (ingredients, nutrition, extra
information) and all pictures.

The page is a tree of screen widgets. The container ids used here are the ones
named in python-picnic-api2 (models/article.py) and in MRVDH/picnic-api
(catalog/helpers.ts, marked experimental there):

    product-page-description / description      the description
    product-page-highlights                     short bullets
    product-page-allergies                      allergens
    accordion-list                              fold-out sections, each an item
                                                with a header and a body
    product-page-image-gallery-main-image-container   the pictures

Pure functions, tolerant by design: an unknown layout gives fewer fields,
never an exception.
"""

from __future__ import annotations

import re

from pictures import IMAGE_REF, variant_name

_COLOR = re.compile(r"#\([A-Za-z0-9#_]+\)")
# Group headings inside the allergen block, e.g. "Bevat" / "Bevat mogelijk".
_ALLERGEN_HEADING = re.compile(
    r"^(bevat(\s+mogelijk)?|kan\s+bevatten|enth[äa]lt|kann\s+(spuren\s+)?enthalten(\s+von)?|"
    r"contient|peut\s+contenir|contains|may\s+contain)\s*:?$",
    re.I,
)
_DESCRIPTION_IDS = ("product-page-description", "description")
_HIGHLIGHTS_ID = "product-page-highlights"
_ALLERGIES_ID = "product-page-allergies"
_ACCORDION_ID = "accordion-list"
_GALLERY_ID = "product-page-image-gallery-main-image-container"


def walk(node):
    """Every dict in the tree, parents before children, in reading order."""
    stack = [node]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            yield current
            stack.extend(reversed(list(current.values())))
        elif isinstance(current, list):
            stack.extend(reversed(current))


def plain(text: str) -> str:
    """Drop Picnic's colour codes; keep **bold** markers and line breaks."""
    text = _COLOR.sub("", text).replace(" ", " ")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(lines).strip()


def texts(node) -> list[str]:
    """Every non-empty text under a node, in reading order."""
    out = []
    for item in walk(node):
        value = item.get("markdown")
        if isinstance(value, str):
            value = plain(value)
            if value:
                out.append(value)
    return out


def find(page, *ids):
    for node in walk(page):
        if node.get("id") in ids:
            return node
    return None


def _pictures(node) -> list[dict]:
    """Picture ids under a node, with the variant Picnic names for each."""
    out, seen = [], set()
    for item in walk(node):
        ref = None
        source = item.get("source")
        if item.get("type") == "IMAGE" and isinstance(source, dict) and isinstance(source.get("id"), str):
            ref = source["id"]
            namespace = source.get("namespace")
            if isinstance(namespace, str) and namespace and "/" not in ref:
                ref = f"{namespace}/{ref}"
        elif item.get("type") == "image_gallery" and isinstance(item.get("image_id"), str):
            ref = item["image_id"]
        if ref and ref not in seen and IMAGE_REF.match(ref):
            seen.add(ref)
            out.append({"ref": ref, "variant": variant_name(item.get("derivativeType"), item.get("extension"))})
    return out


def _allergens(node) -> list[dict]:
    """[{label, items}] where label is a heading such as "Bevat mogelijk"."""
    groups: list[dict] = []
    for text in texts(node):
        bare = text.replace("**", "").strip()
        if _ALLERGEN_HEADING.match(bare):
            groups.append({"label": bare.rstrip(":").strip(), "items": []})
            continue
        if not groups:
            groups.append({"label": "", "items": []})
        for part in re.split(r"\s*,\s*", bare):
            if part and part not in groups[-1]["items"]:
                groups[-1]["items"].append(part)
    return [group for group in groups if group["items"]]


def _sections(node) -> list[dict]:
    """The fold-out sections: [{title, text}]."""
    for item in walk(node):
        entries = item.get("items")
        if not isinstance(entries, list):
            continue
        sections = []
        for entry in entries:
            if not isinstance(entry, dict) or "header" not in entry or "body" not in entry:
                continue
            title = [text.replace("**", "").strip() for text in texts(entry["header"])]
            body = texts(entry["body"])
            if title and title[0] and body:
                sections.append({"title": title[0], "text": "\n".join(body)})
        if sections:
            return sections
    return []


def parse_extras(page) -> dict:
    """What the product page says beyond name and price.

    Returns {description, highlights, allergens, sections, pictures}; each is
    empty when the page has no such part or names it differently.
    """
    description = find(page, *_DESCRIPTION_IDS)
    highlights = find(page, _HIGHLIGHTS_ID)
    allergies = find(page, _ALLERGIES_ID)
    accordion = find(page, _ACCORDION_ID)
    gallery = find(page, _GALLERY_ID)
    pictures = _pictures(gallery) if gallery else []
    if not pictures:  # no gallery container: the first-picture node the library reads
        pictures = _pictures([node for node in walk(page) if node.get("type") == "image_gallery"])[:1]
    return {
        "description": "\n".join(texts(description)) if description else "",
        "highlights": texts(highlights) if highlights else [],
        "allergens": _allergens(allergies) if allergies else [],
        "sections": _sections(accordion) if accordion else [],
        "pictures": pictures,
    }
