# Every Picnic call this app makes

Picnic publishes no documentation for its service. What exists are open-source
clients whose authors read the phone app's traffic. This page lists each call
the app makes, where it is written down, and how it was tested here.

Sources:

- **Library**: [python-picnic-api2](https://github.com/codesalatdev/python-picnic-api)
  2.0.1, the pinned dependency. Its source was read, and its test suite ships
  sample responses captured from the live service with personal details removed.
- **MRVDH**: [MRVDH/picnic-api](https://github.com/MRVDH/picnic-api) 4.10.0, a
  TypeScript client with typed responses and comments.
- **mcp-picnic**: [ivo-toby/mcp-picnic](https://github.com/ivo-toby/mcp-picnic),
  which uses the recipe pages and has scripts to probe them live.

**Nothing on this page has been run against the live service from this
project.** That is what "Check what works with Picnic" in the app is for.

## Through the library's own methods

| Purpose | Call | Written down in | Tested here with |
|---|---|---|---|
| Sign in | `POST /user/login` | Library `client.py` | The real library code with canned answers |
| Verification code | `POST /user/2fa/generate`, `/user/2fa/verify` | Library `client.py` | Same |
| Account name | `GET /user` | Library | Library sample `user_de.json` |
| Search | `GET /pages/search-page-results?search_term=` | Library, MRVDH | Library sample `search_page_nl.json` |
| Read the basket | `GET /cart` | Library, MRVDH | Library sample `cart_de.json` (an empty basket) |
| Add, remove, empty | `POST /cart/add_product`, `/cart/remove_product`, `/cart/clear` | Library, MRVDH | Request bodies compared with the library's |
| Past deliveries | `POST /deliveries/summary`, `GET /deliveries/<id>` | Library, MRVDH | Library samples `current_deliveries_de.json`, `delivery_de.json` |
| Product name for a recipe line | `GET /pages/product-details-page-root?id=` | Library | Library sample `product_details_page_nl.json` |

## Made by this app, because the library has no recipe support

| Purpose | Call | Written down in | Tested here with |
|---|---|---|---|
| Recipe overview | `GET /pages/cookbook-page-content` | MRVDH `recipe/service.ts`, mcp-picnic `picnic-tools.ts` | Page shapes taken from those projects' tests |
| Recipe category | `GET /pages/recipe_cattree_<id>`, ids read from the overview | mcp-picnic `picnic-tools.ts` | Demo shop only |
| One recipe | `GET /pages/selling-group-details-page?selling_group_id=&portions=` | MRVDH, mcp-picnic | Page shapes taken from those projects' tests |
| Put a recipe in the basket | `POST /pages/task/assign-selling-group-to-basket` with `{"payload": {"selling_group_id", "portions"}}` | MRVDH `recipe/types.ts` (read from the app's own page script), mcp-picnic | Request body asserted; the answer is not relied on |
| App version sent with recipe calls | `x-picnic-agent: 30100;1.246.1-15599;` | MRVDH `http-client.ts` | Asserted; falls back to the library's version |
| Pictures | `/static/images/<id>/<size>.png`, `/static/images/recipes/<id>/<size>.png` | Library `helper.py` | Address pattern only |

## Fields that are read, and where they are described

| Field | Meaning used | Source |
|---|---|---|
| Search tile `display_price` | The price shown, in cents | Library README |
| Search tile `price_ranges[].price`, `.from_quantity` | Lower price per unit from a quantity | MRVDH `types/fusion.ts` |
| Decorators `LABEL`, `PROMO` (`text`), `BASE_PRICE` (`base_price_text`), `UNAVAILABLE` (`explanation.short_explanation`), `QUANTITY` (`quantity`) | Tags, price per kilo, not available, units on a line | MRVDH `types/common.ts` |
| Basket line `display_price` / `price` | The line's price | Library `models/common.py` |
| Basket line decorator `PRICE` | The line's discounted total, used when present | MRVDH `cart/types.ts` |
| `selected_slot.state` | Shown slot; the value is not interpreted | MRVDH `cart/types.ts` |
| `analytics_context_data.items_list[].is_in_recipe` | "for a recipe" next to a basket line | MRVDH `cart/types.ts` |
| Recipe `selling_units[]`: `selling_unit_id`, `ingredient_id`, `quantity`, `checked`, `status` | The products of a recipe; `checked` is Picnic's default tick | MRVDH `recipe/types.ts`, mcp-picnic |
| Tile contexts `recipe_id`, `recipe_name`, `segment_type`, `segment_name` | Recipe lists and their groups | MRVDH `recipe/helpers.ts` |
| Error answers `{"error": {"code", "message"}}` | Shown as "Picnic says: …" | Library, MRVDH `http-client.ts` |

## What nobody has written down, so it is not relied on

- **Ticking only some ingredients.** No documented call adds a recipe with a
  selection. The app adds the whole recipe with the documented call, compares
  the basket before and after to see what Picnic actually put in, and then
  removes the products you unticked with the ordinary remove call.
- **The recipe email.** The recipe goes into the basket with the same call the
  phone app makes, which is the best available reason to expect the email.
  Whether it still comes after some of the recipe's products are removed is
  not known.
- **Names and prices on a recipe's products** are read from the text of the
  product tiles on the recipe page, the way mcp-picnic does it. If the layout
  differs, a pack size can end up where the name should be. Missing names are
  filled in from the product page through the library.
- **What Picnic returns for a shortcut word** such as "vegan". Shortcuts are
  saved searches, not Picnic's own category tree, which newer app versions
  receive in a format this app does not read.

## Not possible to test where this was written

- Any call against the real service.
- Loading pictures.
- Building the container image. The workflow in `.github/workflows/check.yml`
  does that on every push, and starts the image in demo mode.
