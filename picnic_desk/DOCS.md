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
  star saves a product under **Saved**.
- **Paste a list**: one product per line. Start a line with a number
  (`2 havermelk`, `3x tomatenblokjes`) and the first click adds that many.
- **Bought before**: everything from your last 10 orders, most often bought
  first. Rebuilt at most every 12 hours; **Refresh** rebuilds it now.
- **Saved**: products you starred, kept by this app.
- **Recipes**: Picnic's recipes by category, search, recipes you saved on your
  Picnic account (♥), and a price on every card. Open a recipe to choose
  portions, untick what you have, **Swap** an ingredient, and add the rest:
  they go into the basket as that recipe, as in the app. **Meal plan**: tick
  **Plan** on recipes you want, **Fill the plan** picks the rest so that packs
  are shared, and **Show shopping list** adds everything at once.
- **Orders**: your orders in a table. An order on its way shows the van's
  route and expected arrival. Cancel an order, e-mail the invoice again, rate
  a delivery, or put an old order in the basket again. The parcel service is
  linked from there.
- **The receipt** follows the real Picnic basket, so changes made in the phone
  app show when you come back to this tab. Clicks show at once and go to
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

In the app's own data folder, which Home Assistant includes in backups:

- `auth.json`: the Picnic session, readable only by the app. Your password
  goes to Picnic once at sign-in and is never written anywhere. The token
  never reaches a browser: every browser in the household uses the one
  session. **Sign out** deletes it.
- `saved.json`, `shortcuts.json`: saved products and shortcuts.
- `history.json`, `recipe_prices.json`: "Bought before" and the recipe card
  prices. **Sign out** deletes both.
- `picture-cache/`: Picnic's product and recipe pictures. Each is fetched from
  Picnic the first time it is shown and kept, so it keeps showing when
  Picnic's picture server is slow or down. When the folder reaches
  `picture_cache_mb`, the pictures shown longest ago make room. It is left out
  of backups; deleting it is harmless.

Meal plans and a pasted list are kept in the browser.

The app has no open network port. It only accepts connections from Home
Assistant's ingress gateway, behind your Home Assistant login. The page loads
nothing from other sites: Picnic's pictures come through the app.

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
