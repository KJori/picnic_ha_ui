# Picnic Desk

A desktop Picnic shop in the Home Assistant sidebar: Picnic's categories and
search, product pages, the basket as a till receipt, delivery times, checkout
and payment, orders with live tracking, the cookbook with meal planning, and a
few things of its own (a pasted shopping list, what you bought before, saved
products, shortcuts).

The Picnic side is the code of [picnic-web](https://github.com/MRVDH/picnic-web)
by MRVDH, which talks to Picnic through the unofficial
[picnic-api](https://github.com/MRVDH/picnic-api). Picnic Desk runs that code
unchanged and puts its own desktop screen on top. Neither is affiliated with
Picnic.

## First use

1. Turn on **Show in sidebar**, start the app and open **Picnic** in the sidebar.
2. Sign in with your Picnic e-mail address and password. If Picnic asks for a
   verification code it sends one by text message; you can have it sent again
   by text message or by e-mail. You can also sign in with a Picnic auth token.
3. Select **Check what works with Picnic** under the receipt. It tries your
   account, search, a product page, pictures, the basket, delivery times,
   categories, recipes and orders against the real service. Nothing in your
   basket changes.

On the Configuration tab:

- `country_code`: NL, DE or FR.
- `language`: the language of the screens: `en`, `nl`, `de` or `fr`. Product
  names and texts are always Picnic's own.
- `picture_cache_mb`: how much room the product and recipe pictures may take
  (500 MB unless you change it, from 50 to 10000).
- `allowed_users`: Home Assistant user names that may use your Picnic account
  besides you, e.g. a partner's. See "Who can use it".

## Who can use it

The Picnic account belongs to the Home Assistant user who signed in to it
here. Other Home Assistant users who open the app see "Not your Picnic
account": nothing of your basket, orders, name or address, and they cannot
sign you out or connect their own account over yours. To share it, add their
Home Assistant user name (not the display name) to `allowed_users`. After you
sign out, the next person to sign in owns it.

Home Assistant tells the app who is using it. If it does not (older
versions), or if you signed in before version 1.0, anyone who can open the app
can use the account; **Check what works with Picnic** says so under "Who may
use it". Signing out and in again ties the account to you.

Only Home Assistant administrators see the app in the sidebar. Until a recent
Home Assistant Supervisor change, that hid the entry but did not stop other
users from opening the app by its address, which is why the app checks for
itself.

## Using it

The desk: a big search box and a row of tabs above the shelf on the left, the
basket as a till receipt on the right.

- **Search**: type in the box; Picnic's suggestions appear as you type. Words
  separated by commas are searched one after the other, each with its own row.
  The shortcuts under the box are saved searches: **Edit shortcuts** adds and
  removes them.
- **Categories**: Picnic's own aisles (and its promotions) in a column on the
  left; a category's subcategories and products on the right.
- **Products**: click one for its page: pictures, description, allergens,
  ingredients, nutrition, "more for less" offers and similar products. The
  star saves a product under **Saved**. Under each product: its size and the
  price per kilo, litre or piece, worked out from the size. A size that is not
  plain ("300 g, uitlekgewicht 180 g") gets no price per kilo rather than a
  wrong one; the product page shows Picnic's own.
- **Order**: above results, **Picnic's order**, **Price** (cheapest first) or
  **Price per kg or litre** (cheapest per kilo or litre first; products sold
  per piece, and those whose size cannot be read, come after). The choice is
  kept in the browser.
- **Paste a list**: one product per line. Start a line with a number
  (`2 havermelk`, `3x tomatenblokjes`) and the first click adds that many.
  The product you choose for a line is remembered: next time it comes first,
  and **Put my … usual picks in the basket** adds every remembered line at
  once. **Forget this pick** lets it choose again.
- **Bought before**: everything from your last 10 orders, most often bought
  first. Rebuilt at most every 12 hours; **Refresh** rebuilds it now.
- **Saved**: products you starred, kept by this app.
- **Lists**: a basket kept for another time, such as "weekly basics". Choose
  **Save as list** under the receipt. **Put in the basket** tops up: what is
  already in the basket counts, so a list asking for two of something that is
  in the basket once adds one. A list can be edited, renamed, replaced with
  the current basket, or deleted.
- **Undo**: taking the last one of a product out of the basket, emptying the
  basket, and putting a list in the basket each show a notice with **Undo**.
  After emptying, Undo puts the products back as products, not as the recipe
  they came with.
- **Recipes**: Picnic's recipes by category, search, recipes you saved on your
  Picnic account (♥), and a price on every card. Open a recipe to choose
  portions, untick what you have, **Swap** an ingredient, and add the rest:
  they go into the basket as that recipe, as in the app. **Meal plan**: tick
  **Plan** on recipes you want, **Fill the plan** picks the rest so that packs
  are shared, and **Show shopping list** adds everything at once.
- **Your order**: an order you placed shows above the search box: "Your order
  arrives tomorrow, 17:00 to 18:00", and once the van is driving "Your order is
  on its way, expected around 17:24", with a link to follow it live. Times are
  the shop's local time.
- **Orders**: your orders in a table. An order on its way shows the van's
  route and expected arrival. Cancel an order, e-mail the invoice again, rate
  a delivery, or put an old order in the basket again. The parcel service is
  linked from there.
- **The receipt** follows the real Picnic basket. Open tabs of the app in the
  same browser keep each other up to date at once: the basket, lists, picks,
  saved products, and signing in or out. Changes made in the phone app or on
  another computer show within a minute while the tab is shown, and at once
  when you come back to it. Clicks show at once and go to
  Picnic in the background; if Picnic refuses one, the receipt is fetched
  again. Under the total: how far you are from the minimum order, the
  delivery time (**Change** opens the week), and **Check out**.
- **Check out**: Picnic checks the basket (and may ask an age check), then
  **Pay at the bank** opens the bank in a new tab. Keep the Picnic tab open: it
  watches the payment and confirms the order as soon as Picnic says it is paid.

Keyboard: `/` jumps to the search box and `Enter` moves into the results. On a
product, `Enter` opens its page, `+` and `-` change the amount, `s` saves it
and the arrow keys move around. `Esc` closes a product page or clears the
search.

## What is stored

In the app's own data folder:

- `auth.json`: the Picnic session and which Home Assistant user it belongs
  to, readable only by the app. Your password goes to Picnic once at sign-in
  and is never written anywhere. The token never reaches a browser. **Sign
  out** deletes it. Left out of backups: a backup that ends up on a NAS or in
  the cloud cannot be used to get into your Picnic account. After restoring a
  backup, sign in again.
- `history.json`, `recipe_prices.json`: "Bought before" and the recipe card
  prices. **Sign out** deletes both. Left out of backups; they are built
  again when needed.
- `saved.json`, `shortcuts.json`, `lists.json`, `picks.json`: saved products,
  shortcuts, lists and the products picked for pasted lines. These are in
  backups.
- `picture-cache/`: Picnic's product and recipe pictures. Each is fetched from
  Picnic the first time it is shown and kept, so it keeps showing when
  Picnic's picture server is slow or down. When the folder reaches
  `picture_cache_mb`, the pictures shown longest ago make room. Left out of
  backups; deleting it is harmless.

In the browser: a pasted list, a meal plan, and a payment being watched.
**Sign out** clears them from that browser.

What goes where:

- The app has no open network port. It only accepts connections from Home
  Assistant's ingress gateway, behind your Home Assistant login.
- The app's server talks to Picnic's servers only, over https; it refuses to
  send anything anywhere else. Picnic sees what the Picnic app would: your
  account, searches, basket and orders.
- The page loads nothing from other sites: Picnic's pictures come through the
  app. It sends no referrer, and other sites cannot embed it or read from it.
- When you pay, Picnic and your bank get the address of this app in Home
  Assistant, to send your browser back after paying, as with any web shop.
- The Log tab can show Picnic's error messages and which page failed; never
  your password or session.

## If something does not work

- Run **Check what works with Picnic** and note which part fails; the details
  say what Picnic answered. Under "Pictures" it fetches a few pictures from
  Picnic again, says which kind of address worked, and how many pictures are
  kept.
- A product page and the check page have **Download what Picnic sent**: the
  page as Picnic sent it, which shows what needs fixing. It can contain your
  name and address, so look through it before sharing.
- Picnic limits how many requests it answers in a short time. When that
  happens, parts of the page fail for a minute or two; the session stays
  signed in.
- The Log tab shows the underlying errors.

## Limits

- Unofficial: Picnic can change its service at any time, which can break any
  part. Updates of Picnic Desk take in picnic-web's fixes.
- After paying, the bank sends the browser back to Picnic Desk. Behind Home
  Assistant that page may ask you to log in or show an error; the order is
  confirmed by the Picnic tab you kept open, so close the bank's tab.
- Not here: wallet, Family account, friend discount, shopping reminder.

## License

Picnic Desk is free software under the GNU Affero General Public License
v3.0, because it contains picnic-web, which uses that license. The source is
at the address under **Website** on the app's page in Home Assistant. The
licenses of everything the app contains are in `THIRD_PARTY_LICENSES.txt` in
the app's image.
