# Changelog

All notable changes to Picnic Desk. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version
numbers [Semantic Versioning](https://semver.org/).

## [1.0.6]

### Fixed

- Adding to an order you already placed works as in the Picnic app: with that
  order's delivery time chosen, you can check out any amount, also below the
  minimum order. The receipt says the basket is added to that order, and the
  week of delivery times marks the time of your order. Before, the desk asked
  for the minimum order anyway.

## [1.0.5]

### Changed

- Home Assistant accounts that are not administrators can now use Picnic
  Desk: the app shows in every user's sidebar, and `allowed_users` says who
  may use it. With names in `allowed_users`, only those users can open it,
  sign in, shop and sign out, and nobody else, administrators included. So an
  administrator account you only use to manage Home Assistant can stay out.
- **If you already use `allowed_users`, add your own user name to it too**:
  signing in to Picnic no longer gives access by itself when the list has
  names. Someone who is refused sees "No access to Picnic" and their user
  name, so you know what to add.
- With an empty `allowed_users`, nothing changes: whoever signs in to Picnic
  is the only one who can use it. That can now be any Home Assistant user,
  not only an administrator.

## [1.0.4]

### Changed

- Search, product pages, recipes, categories, the basket and order tracking
  are now read from Picnic by picnic-api 5, which follows the current Picnic
  app. Search asks Picnic the way the app does: Picnic now serves its search
  page without the results, which the app fetches separately, so the old way
  could come back empty. Results come in the app's sections.
- Product pages show the size badge ("XL") and all of Picnic's tags, as the
  app does, and the product's own "more for less" prices.
- A recipe loads with one request to Picnic instead of one per ingredient,
  so recipes open faster and set off Picnic's rate limit less often.
- **Acties** in the categories opens Picnic's offers page, now with cards for
  offers on several products ("2 voor €3,99"); a card opens its products.
- A category's links open the app's own category pages, and a category shows
  its own offers next to its subcategories.

### Fixed

- German "Kann enthalten" allergens no longer show as certain.
- An order's discount is no longer counted twice for products ordered more
  than once.

### Removed

- The suggested replacements under a sold-out product in the basket: Picnic
  sends only placeholders there now.

## [1.0.3]

### Changed

- The page now runs on React 19.3, the library it is built with. You should
  not notice a difference: everything looks and works as before.

## [1.0.2]

### Fixed

- A paid order is confirmed even when the Picnic Desk tab is closed, the
  computer goes to sleep or the app restarts while you pay: the app itself
  watches the payment and confirms the order. A payment in progress shows at
  the top of every page, on every device.
- When Picnic takes an order but answers too late, the app no longer says
  confirming failed: it sees the new order and says it was placed. If Picnic
  gives no answer either way for two hours, the top of the page asks you to
  check your orders before ordering again.
- The order is never confirmed twice, however many tabs are open.

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
