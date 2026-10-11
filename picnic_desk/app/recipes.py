"""Read Picnic's recipe pages.

Recipes ("gerechten") are not a tidy data API. Picnic sends the app a tree of
screen widgets, and the facts we need are scattered through it: analytics
contexts carry recipe ids, names and the list of products per recipe, the
product tiles carry names, pack sizes and prices as text.

The approach here follows two other open-source clients that were checked
against the live service, MRVDH/picnic-api and ivo-toby/mcp-picnic. Everything
is tolerant by design: unknown shapes produce fewer fields, never an exception.

Pure functions only, so they can be tested without a Picnic account.
"""

from __future__ import annotations

import json
import re

from pictures import variant_name

HEX_ID = r"[a-f0-9]{24,32}"
_ID = re.compile(rf"^{HEX_ID}$")
_ID_REF = re.compile(rf"(?:selling_group_id|recipe_id|recipeIds)=({HEX_ID})")
_NAME_IN_TEXT = re.compile(
    rf'\\?"recipe_id\\?"\s*:\s*\\?"({HEX_ID})\\?"[\s\S]{{0,160}}?\\?"recipe_name\\?"\s*:\s*\\?"([^"\\]+)'
)
_CATEGORY = re.compile(r"recipe[_-]cattree[_-][a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?", re.I)
_CATEGORY_PREFIX = re.compile(r"^recipe[_-]cattree[_-]", re.I)
_COLOR = re.compile(r"#\([^)]*\)")
_LINK = re.compile(r"\[([^\]]+)\]\((?:action|app|https?)://[^)]*\)")
_PRICE = re.compile(r"^(?:€\s*)?(\d{1,4})[,.](\d{2})(?:\s*€)?$")
_TIME = re.compile(r"\b\d+\s*min\b", re.I)
# A price somewhere in a line of tile text, e.g. "€ 2,45 p.p." or "vanaf 3.10 €".
_PRICE_IN_LINE = re.compile(r"€\s*\d{1,3}[,.]\d{2}|\d{1,3}[,.]\d{2}\s*€")
_BUTTON_WORDS = {
    "add", "ajouter", "ansehen", "bekijken", "hinzufügen", "toevoegen", "view", "voir",
    "nicht alles vorrätig",
}
_TILE_TYPES = {"recipe_tile", "recipe_tile_mini"}


def walk(node):
    """Every dict in the tree, parents before children."""
    stack = [node]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            yield current
            stack.extend(reversed(list(current.values())))
        elif isinstance(current, list):
            stack.extend(reversed(current))


def clean(text: str) -> str:
    text = _COLOR.sub("", text)
    text = _LINK.sub(r"\1", text)
    text = text.replace("**", "").replace("__", "").replace(" ", " ")
    return re.sub(r"\s+", " ", text).strip()


def _contexts(node: dict) -> list[dict]:
    """The data dicts of a node's analytics contexts."""
    analytics = node.get("analytics")
    found = analytics.get("contexts") if isinstance(analytics, dict) else None
    if not isinstance(found, list):
        found = node.get("contexts") if isinstance(node.get("contexts"), list) else []
    return [c["data"] for c in found if isinstance(c, dict) and isinstance(c.get("data"), dict)]


def _lines(node) -> list[tuple[str, str | None]]:
    """Cleaned text lines under a node, in reading order, with their text type."""
    out = []
    for item in walk(node):
        if item.get("type") == "RICH_TEXT" and isinstance(item.get("markdown"), str):
            for raw in item["markdown"].split("\n"):
                text = clean(raw)
                if text:
                    out.append((text, item.get("textType")))
    return out


def _image(node) -> tuple[str | None, str | None]:
    """First image under a node: ('namespace/id' or a bare id, the variant
    Picnic names for it such as 'padded.webp', or None)."""
    for item in walk(node):
        source = item.get("source")
        if item.get("type") == "IMAGE" and isinstance(source, dict) and isinstance(source.get("id"), str):
            return _image_ref(source["id"], source.get("namespace")), variant_name(
                item.get("derivativeType"), item.get("extension")
            )
    return None, None


def _image_ref(image_id: str, namespace) -> str:
    if isinstance(namespace, str) and namespace and "/" not in image_id:
        return f"{namespace}/{image_id}"
    return image_id


def _strings(node):
    stack = [node]
    while stack:
        current = stack.pop()
        if isinstance(current, str):
            yield current
        elif isinstance(current, dict):
            stack.extend(reversed(list(current.values())))
        elif isinstance(current, list):
            stack.extend(reversed(current))


def _noise(text: str) -> bool:
    return (
        text.lower() in _BUTTON_WORDS
        or bool(re.match(r"^[-+]?\d+%$", text))
        or bool(re.match(r"^[><%]", text))
        or bool(re.match(r"^\d+[.)]?$", text))
    )


def _label(slug: str) -> str:
    words = re.sub(r"[_-]+", " ", slug).strip()
    words = re.sub(r"(?<=\d)(?=[a-z])", " ", words)
    return words[:1].upper() + words[1:] if words else slug


# ----------------------------------------------------------------------- lists


def parse_list(page) -> dict:
    """Recipes on a cookbook or recipe-category page.

    Returns {"recipes": [{id, name, image, image_variant, price_text, segments}], "segments": [{id, label}],
    "categories": [{id, label}]}.
    """
    recipes: dict[str, dict] = {}
    segment_labels: dict[str, str] = {}

    def entry(recipe_id: str) -> dict:
        return recipes.setdefault(
            recipe_id,
            {"id": recipe_id, "name": None, "image": None, "image_variant": None, "price_text": None, "segments": []},
        )

    def tag(item: dict, segment: dict | None):
        if not segment:
            return
        kind = segment["segment_type"]
        if kind not in item["segments"]:
            item["segments"].append(kind)
        name = segment.get("segment_name")
        named = isinstance(name, str) and name.strip() and name != kind
        if named or kind not in segment_labels:
            segment_labels[kind] = name.strip() if named else _label(kind.lower())

    for node in walk(page):
        datas = _contexts(node)
        if not datas:
            continue
        recipe = next(
            (d for d in datas if isinstance(d.get("recipe_id"), str) and _ID.match(d["recipe_id"])), None
        )
        segment = next((d for d in datas if isinstance(d.get("segment_type"), str)), None)
        is_tile = any(d.get("type") in _TILE_TYPES for d in datas)

        if not recipe and not is_tile:
            if segment:  # a shelf: everything it links to belongs to the segment
                for recipe_id in _ID_REF.findall(json.dumps(node)):
                    tag(entry(recipe_id), segment)
            continue

        recipe_id = recipe["recipe_id"] if recipe else None
        if not recipe_id:
            match = _ID_REF.search(json.dumps(node))
            recipe_id = match.group(1) if match else None
        if not recipe_id:
            continue

        item = entry(recipe_id)
        tag(item, segment)
        if not item["name"]:
            name = recipe.get("recipe_name") if recipe else None
            if not isinstance(name, str) or not name.strip():
                lines = _lines(node.get("pml") if isinstance(node.get("pml"), dict) else node)
                titled = [text for text, kind in lines if kind == "SUBTITLE1"]
                plausible = [
                    text for text, _ in lines
                    if 4 <= len(text) <= 90 and not _noise(text) and not _TIME.search(text) and not _PRICE.match(text)
                ]
                name = titled[0] if titled else (max(plausible, key=len) if plausible else None)
            item["name"] = name.strip() if isinstance(name, str) and name.strip() else None
        if not item["image"]:
            item["image"], item["image_variant"] = _image(node)
        if not item["price_text"] and is_tile:
            # If the tile itself shows a price, pass its wording on unchanged.
            shown = _lines(node.get("pml") if isinstance(node.get("pml"), dict) else node)
            item["price_text"] = next((text for text, _ in shown if _PRICE_IN_LINE.search(text) and len(text) <= 40), None)

    # Names that only exist inside script strings (the user's own recipes).
    missing = {item["id"] for item in recipes.values() if not item["name"]}
    categories: dict[str, str] = {}
    for text in _strings(page):
        if missing and "recipe_name" in text:
            for recipe_id, name in _NAME_IN_TEXT.findall(text):
                if recipe_id in missing:
                    recipes[recipe_id]["name"] = name
                    missing.discard(recipe_id)
        if "cattree" in text:
            for page_id in _CATEGORY.findall(text):
                categories.setdefault(page_id.lower(), _label(_CATEGORY_PREFIX.sub("", page_id)))

    return {
        "recipes": list(recipes.values()),
        "segments": [{"id": key, "label": value} for key, value in segment_labels.items()],
        "categories": [{"id": key, "label": value} for key, value in categories.items()],
    }


# --------------------------------------------------------------------- details


def _tile_display(node: dict) -> dict:
    lines = _lines(node.get("pml") if isinstance(node.get("pml"), dict) else node)
    price = None
    price_at = None
    for index, (text, _) in enumerate(lines):
        match = _PRICE.match(text)
        if match:
            price = int(match.group(1)) * 100 + int(match.group(2))
            price_at = index
            break
    usable = [
        (index, text, kind) for index, (text, kind) in enumerate(lines)
        if index != price_at and not _noise(text) and not _PRICE.match(text)
    ]
    titled = [entry for entry in usable if entry[2] == "SUBTITLE1"]
    name_entry = titled[0] if titled else (usable[0] if usable else None)
    # The pack size normally follows the name; only look before it as a last resort.
    rest = [entry for entry in usable if name_entry and entry[0] > name_entry[0]]
    rest = rest or [entry for entry in usable if entry is not name_entry]
    image, image_variant = _image(node)
    return {
        "name": name_entry[1] if name_entry else None,
        "unit": rest[0][1] if rest else "",
        "price": price,
        "image": image,
        "image_variant": image_variant,
    }


def parse_detail(page, recipe_id: str | None = None) -> dict | None:
    """One recipe from its selling-group-details page, or None if unrecognised.

    Ingredients are the products Picnic would put in the basket for the shown
    number of portions. "checked" is Picnic's own default: False marks things
    most people have at home.
    """
    context = None
    title: dict = {}
    header: dict = {}
    image = None
    image_variant = None

    for node in walk(page):
        if (
            context is None
            and isinstance(node.get("selling_units"), list)
            and isinstance(node.get("recipe_id"), str)
            and isinstance(node.get("recipe_name"), str)
            and (recipe_id is None or node["recipe_id"] == recipe_id)
        ):
            context = node
        section = node.get("selling_group_title_section_data")
        if isinstance(section, dict) and not title:
            title = section
        head = node.get("selling_group_header_data")
        if isinstance(head, dict) and not header:
            header = head
        if not header and isinstance(node.get("creator_type"), str) and isinstance(node.get("sellable_name"), str):
            header = node
        picture = node.get("selling_group_image_data")
        if image is None and isinstance(picture, dict):
            images = picture.get("images")
            images = images.get("images") if isinstance(images, dict) else None
            if isinstance(images, list):
                usable = [i for i in images if isinstance(i, dict) and isinstance(i.get("id"), str)]
                primary = next((i for i in usable if i.get("primary")), usable[0] if usable else None)
                if primary:
                    image = _image_ref(primary["id"], primary.get("namespace"))
        if image is None and node.get("id") == "selling-group-details-image":
            image, image_variant = _image(node)

    if context is None:
        return None

    # Product tiles, findable by product id and by the recipe's ingredient id.
    tiles: dict[str, dict] = {}
    for node in walk(page):
        is_unit_tile = isinstance(node.get("id"), str) and "selling-unit-tile" in node["id"]
        for data in _contexts(node):
            keys = []
            if isinstance(data.get("product_id"), str):
                keys.append(data["product_id"])
            units = data.get("selling_units")
            if is_unit_tile and isinstance(units, list) and len(units) == 1 and isinstance(units[0], dict):
                keys += [units[0].get("selling_unit_id"), units[0].get("ingredient_id")]
            keys = [key for key in keys if isinstance(key, str) and key and key not in tiles]
            if keys:
                display = _tile_display(node)
                for key in keys:
                    tiles[key] = display

    ingredients = []
    for unit in context["selling_units"]:
        if not isinstance(unit, dict):
            continue
        product_id = unit.get("selling_unit_id")
        if not isinstance(product_id, str) or not product_id:
            continue
        tile = tiles.get(product_id) or tiles.get(unit.get("ingredient_id")) or {}
        quantity = unit.get("quantity")
        status = unit.get("status") if isinstance(unit.get("status"), str) else "ACTIVE"
        ingredients.append(
            {
                "id": product_id,
                "ingredient_id": unit.get("ingredient_id"),
                "qty": quantity if isinstance(quantity, int) and quantity > 0 else 1,
                "checked": unit.get("checked") is not False,
                "available": status != "UNAVAILABLE",
                "name": tile.get("name"),
                "unit": tile.get("unit") or "",
                "price": tile.get("price"),
                "image": tile.get("image"),
                "image_variant": tile.get("image_variant"),
            }
        )

    portions = context.get("portions")
    default = header.get("default_portions")
    return {
        "id": context["recipe_id"],
        "name": context.get("recipe_name") or title.get("name") or header.get("sellable_name") or "",
        "description": title.get("description") if isinstance(title.get("description"), str) else "",
        "portions": portions if isinstance(portions, int) and portions > 0 else (default if isinstance(default, int) else 2),
        "default_portions": default if isinstance(default, int) else None,
        "image": image,
        "image_variant": image_variant,
        "ingredients": ingredients,
    }
