# Changelog

## 0.3.0

- Product page: click a product anywhere (search, basket, recipe) for its
  pictures, description, allergens, ingredients and nutrition. `Enter` on a
  product now opens this page; `+` still adds.
- Pictures: a search tile's picture is now loaded the way the tile itself
  names it (its own picture id and file type), with the documented sizes as
  fallbacks. Before, only one address form was tried, so pictures that exist
  in another form stayed empty.
- Recipes show a price indication: on each card for the default portions, and
  per portion next to the total when a recipe is open.
- "Check what works with Picnic" now tries up to eight pictures, says which
  address form worked, spells out a picture that failed, and opens a product
  page.

## 0.2.0

- Distributed as an app repository: add and remove it with one address.
- Shortcuts: one-click saved searches under the search box, editable.
  Several words separated by commas are searched one after the other.
- Recipes: browse Picnic's recipes, open one, choose portions, tick what you
  need and add it to the basket.
- "Check what works with Picnic": tries every read-only part against the real
  service and lists the result.
- Search tiles now show bundle prices ("each from 4") and read the
  not-available note from the documented field.
- Basket lines show the discounted total when Picnic sends one, and mark
  products that are in the basket for a recipe.
- Removed the app's own init setting and added the image labels the Home
  Assistant docs ask for.

## 0.1.0

- Search, paste a list, bought before, saved products, basket.
