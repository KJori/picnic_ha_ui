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
- New: pictures are kept by the app: fetched from Picnic once, then shown from
  the app's folder, also when Picnic's picture server is down. The folder has
  a size limit (`picture_cache_mb`, 500 MB) and is left out of backups. The
  page no longer loads anything from outside Home Assistant.
- Kept: the desk layout (search box, tabs, shelf, receipt), shortcuts, several
  searches at once, a pasted list, bought before, saved products, the
  self-check, the keyboard, prices on recipe cards. picnic-web's screens are
  made for a phone; here its parts are laid out for a desk: aisles beside the
  shelf, the week of delivery times in one grid, orders in a table.
- New: Home Assistant restarts the app when it stops answering (watchdog).
- New: the Picnic account belongs to the Home Assistant user who signed in to
  it; others see "Not your Picnic account" unless named in `allowed_users`.
- New: backups no longer contain the Picnic session, the order history or
  pictures; signing out also clears the page's data from that browser.
- New: the app's server only talks to Picnic; the page refuses inline styles
  and scripts and cannot be embedded or read by other sites.
- Changed: the app now runs on Node.js. Your Picnic session, saved products
  and shortcuts carry over.

## 0.3.0

- Product pages, picture loading with fallbacks, recipe price indication.

## 0.2.0

- App repository, shortcuts, recipes, the self-check.

## 0.1.0

- Search, paste a list, bought before, saved products, basket.
