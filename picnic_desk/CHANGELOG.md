# Changelog

All notable changes to Picnic Desk. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version
numbers [Semantic Versioning](https://semver.org/).

## [1.0.1]

### Changed

- Delivery times, your orders list and the bottom of the basket (loyalty
  points and the "forgotten anything?" row) are now read from Picnic's answers
  by picnic-api, the library picnic-web shares with other Picnic tools. You see
  the same as before; when Picnic changes these answers, a fix there reaches
  the app too.

## [1.0.0]

Rebuilt on [picnic-web](https://github.com/MRVDH/picnic-web)'s Picnic code, so
it does what picnic-web does, with the same handling of Picnic's answers.

### Added

- Picnic's category tree and promotion pages, search suggestions, results in
  sections.
- Choosing a delivery time, checking out (with Picnic's age check) and paying.
  The bank opens in a new tab; the Picnic tab confirms the order.
- Orders with live tracking, cancelling, rating and the invoice by e-mail;
  "put these in the basket again"; the parcel service.
- The full cookbook: categories with counts, search, saved recipes on your
  Picnic account, swapping an ingredient, meal plans with a shopping list.
  Recipes go into the basket as a recipe, as in the app.
- Product pages with nutrition tables, allergen badges, "more for less" offers
  and similar products. The basket shows deposits, fees, savings, Picnic's
  loyalty points, its "forgotten anything?" row, and replacements for products
  that are no longer available.
- Signing in with a Picnic auth token; the verification code can also come by
  e-mail.
- Screens in English, Dutch, German or French (`language` option), and the
  options described in those languages on the Configuration tab.
- Pictures are kept by the app: fetched from Picnic once, then shown from the
  app's folder, also when Picnic's picture server is down. The folder has a
  size limit (`picture_cache_mb`, 500 MB).
- The Picnic account belongs to the Home Assistant user who signed in to it;
  others see "Not your Picnic account" unless named in `allowed_users`.
- Home Assistant restarts the app when it stops answering (watchdog).
- An icon and a logo for the app store.
- A page left open while the app was updated says so and offers a reload.
- Lists: save the basket as a list ("weekly basics") and put it back in one
  go, topping up what is already in the basket.
- A pasted list remembers the product picked for each line and can add all
  remembered lines at once.
- Undo after taking the last one of a product out, emptying the basket, or
  putting a list in the basket.
- Price per kilo, litre or piece under every product, and ordering results by
  price or by price per kilo or litre.
- Open tabs keep each other up to date at once; changes from the phone app
  show within a minute.
- An order you placed shows above the search box: when it arrives, and once
  the van is driving, that it is on its way with the expected time. In the
  orders table a current order reads "Planned" or "On the way".

### Changed

- The app now runs on Node.js. Your Picnic session, saved products and
  shortcuts carry over.
- The desk layout stays (search box, tabs, shelf, receipt), with shortcuts,
  several searches at once, a pasted list, bought before, saved products, the
  self-check, the keyboard and prices on recipe cards. picnic-web's screens
  are made for a phone; here its parts are laid out for a desk: aisles beside
  the shelf, the week of delivery times in one grid, orders in a table.
- Delivery times and dates are shown in the shop's time zone, also when the
  page is opened from abroad.
- Every screen meets WCAG AA contrast in the light and the dark theme, buttons
  are at least 24 px, and Picnic's own colours are adjusted for the dark theme.

### Security

- Backups no longer contain the Picnic session, the order history or the
  pictures. Signing out also clears the page's data from that browser.
- The app's server only talks to Picnic. The page loads nothing from outside
  Home Assistant, runs no inline script or style, and cannot be embedded or
  read by other sites.

## [0.3.0]

### Added

- Product pages, picture loading with fallbacks, recipe price indication.

## [0.2.0]

### Added

- App repository, shortcuts, recipes, the self-check.

## [0.1.0]

### Added

- Search, paste a list, bought before, saved products, basket.
