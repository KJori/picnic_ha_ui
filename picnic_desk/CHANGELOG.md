# Changelog

## 1.0.0

Rebuilt on [picnic-web](https://github.com/MRVDH/picnic-web)'s Picnic code, so
it does what picnic-web does, with the same handling of Picnic's answers.

- New: Picnic's category tree and promotion pages, search suggestions,
  results in sections.
- New: choosing a delivery time, checking out (with Picnic's age check) and
  paying. The bank opens in a new tab; the Picnic tab confirms the order.
- New: orders with live tracking, cancelling, rating and the invoice by
  e-mail; "put these in the basket again"; the parcel service.
- New: the full cookbook: categories with counts, search, saved recipes on
  your Picnic account, swapping an ingredient, meal plans with a shopping
  list. Recipes go into the basket as a recipe, as in the app.
- New: product pages with nutrition tables, allergen badges, "more for less"
  offers and similar products; the basket shows deposits, fees, savings,
  Picnic's loyalty points, its "forgotten anything?" row, and replacements for
  products that are no longer available.
- New: sign in with a Picnic auth token; the verification code can also come
  by e-mail.
- New: screens in English, Dutch, German or French (`language` option).
- Kept: the desk layout (search box, tabs, shelf, receipt), shortcuts, several
  searches at once, a pasted list, bought before, saved products, the
  self-check, the keyboard, prices on recipe cards. picnic-web's screens are
  made for a phone; here its parts are laid out for a desk: aisles beside the
  shelf, the week of delivery times in one grid, orders in a table.
- Changed: the app now runs on Node.js. Your Picnic session, saved products
  and shortcuts carry over.

## 0.3.0

- Product pages, picture loading with fallbacks, recipe price indication.

## 0.2.0

- App repository, shortcuts, recipes, the self-check.

## 0.1.0

- Search, paste a list, bought before, saved products, basket.
