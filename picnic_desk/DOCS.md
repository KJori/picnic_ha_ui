# Picnic Desk

A desktop Picnic shop in the Home Assistant sidebar: Picnic's categories and
search, product pages, the basket as a till receipt, delivery times, checkout
and payment, orders with live tracking, the cookbook with meal planning, and a
few things of its own (a pasted shopping list, what you bought before, starred
products).

The Picnic side is the code of [picnic-web](https://github.com/MRVDH/picnic-web)
by MRVDH, which talks to Picnic through the unofficial
[picnic-api](https://github.com/MRVDH/picnic-api). Picnic Desk runs that code
unchanged and puts its own desktop screen on top. Neither is affiliated with
Picnic.

## First use

1. Turn on **Show in sidebar**, start the app and open **Picnic** in the sidebar.
2. Sign in with your Picnic e-mail address and password. If Picnic asks for a
   verification code, it sends one by text message; **No code? Send it again**
   can send it by e-mail instead. You can also sign in with a Picnic auth token.
3. Open **Account** and select **Run the check**. It tries your account,
   search, a product page, pictures, the basket, delivery times, categories,
   recipes and orders against the real service. Nothing in your basket changes.

On the Configuration tab:

- `country_code`: NL, DE or FR.
- `language`: the language of the screens: `en`, `nl`, `de` or `fr`. Product
  names and texts are always Picnic's own.

## Using it

- **Shop**: Picnic's own category tree and promotions, your shortcuts (one
  click runs a search; change them under Account), and search with Picnic's
  suggestions while you type.
- **Products**: click one for its page: pictures, description, allergens,
  ingredients, nutrition, "more for less" offers and similar products. ☆
  stars a product.
- **Basket**: the receipt on the right. It follows the real Picnic basket, so
  changes made in the phone app show when you come back to this tab. Clicks
  show at once and go to Picnic in the background; if Picnic refuses one, the
  receipt is fetched again and shows what Picnic has.
- **Delivery time**: the bar at the top of the receipt.
- **Check out**: needs the minimum order value. Picnic may ask an age check.
  **Pay at the bank** opens the bank in a new tab. Keep the Picnic tab open:
  it watches the payment and confirms the order as soon as Picnic says the
  payment is done.
- **Cooking**: Picnic's recipes by category, search, saved recipes (♥ saves
  one on your Picnic account), and a price per person on every card. Open a
  recipe to choose portions, untick what you have, swap an ingredient (✎), and
  add the rest. They go into the basket as that recipe, as in the app.
  **Make a plan** picks recipes for the number of days so that packs are
  shared; tick the ones to keep and **plan further**; **Show shopping list**
  adds everything at once.
- **Bought before**: everything from your last 10 orders, most often bought
  first. Rebuilt at most every 12 hours; **Refresh** rebuilds it now.
- **Starred**: products you starred, kept by this app.
- **Paste a list**: one product per line. Start a line with a number
  (`2 havermelk`, `3x tomatenblokjes`) and the first click adds that many.
- **Orders**: current, completed and cancelled orders. An order on its way
  shows the van's route and expected arrival. Cancel an order, e-mail the
  invoice again, rate a delivery, or put an old order in the basket again.
  The parcel service is linked from there.

Keyboard: `/` jumps to the search box and `Enter` moves into the results. On a
product, `+` and `-` change the amount, `s` stars it and the arrow keys move
around. `Esc` closes a product page or clears the search.

## What is stored

In the app's own data folder, which Home Assistant includes in backups:

- `auth.json`: the Picnic session, readable only by the app. Your password
  goes to Picnic once at sign-in and is never written anywhere. The token
  never reaches a browser: every browser in the household uses the one
  session. **Sign out** deletes it.
- `saved.json`, `shortcuts.json`: starred products and shortcuts.
- `history.json`, `recipe_prices.json`: "Bought before" and the recipe card
  prices. **Sign out** deletes both.

Meal plans and a pasted list are kept in the browser.

The app has no open network port. It only accepts connections from Home
Assistant's ingress gateway, behind your Home Assistant login. The page loads
nothing from other sites except Picnic's pictures.

## If something does not work

- Run the check under **Account** and note which part fails; the details say
  what Picnic answered.
- A product page and the account page have **Download what Picnic sent**: the
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
