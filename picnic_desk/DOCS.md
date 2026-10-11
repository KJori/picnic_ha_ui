# Picnic Desk

A desktop screen for filling your Picnic basket. Picnic only has a phone app;
this talks to the same service through the unofficial `python-picnic-api2`
library that Home Assistant's own Picnic integration uses.

It fills the basket. Choosing a delivery slot and paying still happen in the
Picnic app, where the basket you filled here is waiting.

## First use

1. Turn on **Show in sidebar**, start the app and open **Picnic** in the sidebar.
2. Sign in with your Picnic account. If Picnic asks for a verification code,
   choose text message or email and enter the code.
3. Select **Check what works with Picnic** at the bottom of the basket. It
   tries the account, search, pictures, basket, deliveries and recipes against
   the real service and lists what works. Nothing in your basket changes.

For Germany or France, set `country_code` on the Configuration tab and restart.

## Using it

- **Search**: type in the box. Words separated by commas are searched one
  after the other.
- **Product page**: click a product, in the results, the basket or a recipe,
  for its pictures, description, allergens, ingredients and nutrition.
- **Shortcuts**: the labels under the search box are saved searches. Use
  **Edit shortcuts** to add your own or remove one. They are not Picnic's own
  categories, so adjust the search words until a shortcut shows what you want.
- **Paste a list**: one product per line. Start a line with a number
  (`2 havermelk`, `3x tomatenblokjes`) and the first click adds that many.
- **Bought before**: everything from your last 10 deliveries, most frequent
  first, rebuilt at most every 12 hours. Prices there are what you paid then.
- **Saved**: products you starred.
- **Recipes**: Picnic's recipes. Open one, set the portions, untick what you
  already have, and add the rest. The second list holds what Picnic assumes is
  in your cupboard; tick anything you need from it. The price on a card is
  what the products Picnic adds by default cost, as whole packs, for the
  recipe's standard portions. It is worked out once per recipe and kept for a
  day.
- **Basket**: the receipt on the right. It follows the real Picnic basket, so
  changes made in the phone app show up when you return to this tab.

Keyboard: `/` jumps to the search box and `Enter` moves into the results.
On a product, `Enter` opens its page, `+` and `-` change the amount, `s` saves
it and the arrow keys move around. `Esc` closes a product page or clears the
search.

## How recipes are added

The recipe goes into the basket with the same call the phone app makes. That
adds everything Picnic ticks by default. The app then compares the basket with
how it was before and removes the products you unticked; cupboard items you
ticked are added as ordinary products.

Picnic has no documentation for this. The call itself is described by two
other open-source Picnic clients, but whether the recipe email still arrives
after part of a recipe is removed is not known. If it matters, check the
recipe in the phone app before you pay.

## What is stored

In the app's own data folder, which Home Assistant includes in backups:

- `auth.json`: the Picnic session token, readable only by the app. Your
  password is sent to Picnic once at sign-in and is never written anywhere.
  **Sign out** deletes the token.
- `saved.json`, `shortcuts.json`: your starred products and shortcuts.
- `history.json`, `recipe_prices.json`: the cached "Bought before" list and
  recipe price indications. **Sign out** deletes both.

The app has no open network port. It only accepts connections from Home
Assistant's ingress gateway, behind your Home Assistant login.

## If something does not work

- Run **Check what works with Picnic** and note which part fails.
- When recipes fail to load, or a product page comes without description or
  ingredients, the screen offers **Download what Picnic sent**. That file
  shows exactly what needs fixing. It can contain your name and address, so
  look through it before sharing.
- Pictures: the check lists how many of a sample loaded, which address form
  worked, and for a picture that failed every form that was tried with
  Picnic's answer to each.
- The Log tab shows the underlying error.

## Limits

- Unofficial: Picnic can change its service at any time, which can break
  search, the basket, recipes or sign-in.
- No slot picking, checkout or payment.
- Recipe names, pack sizes and prices are read from the text on Picnic's
  recipe pages and can be incomplete. A recipe's price indication says "at
  least" when a product's price could not be read.
- Ingredients, allergens and nutrition come from fold-out sections that only
  one other open-source client describes. When Picnic's page differs, the
  product page shows less.
