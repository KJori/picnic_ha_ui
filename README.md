# Picnic Desk

A Home Assistant app that puts a desktop Picnic shop in the sidebar.

Picnic only has a phone app and no official programming interface.
[picnic-web](https://github.com/MRVDH/picnic-web) by MRVDH is an open-source
web version of it, built on [picnic-api](https://github.com/MRVDH/picnic-api).
Picnic Desk runs picnic-web's Picnic code unchanged (its API routes and the
parsers behind them) on a small Node server, and puts its own desktop screen
on top: the shelf on the left, the basket as a till receipt on the right.

What it does: Picnic's categories and promotions, search with suggestions,
product pages (allergens, nutrition, offers), the basket with deposits, fees,
savings and recipe groups, delivery times, checkout with the age check and
payment, orders with live tracking, cancelling, rating and invoices, the
parcel service, the cookbook (saved recipes, swapping ingredients, meal plans
with a shopping list). Its own extras: shortcuts, a pasted shopping list,
"bought before", saved products, a self-check, keyboard use, prices on
recipe cards. Not included: wallet, Family account, friend discount.

It is not affiliated with Picnic and can break when Picnic changes its service.

## Add it to Home Assistant

1. In Home Assistant go to **Settings > Apps** and select **Install app**.
2. In the top-right corner open the three dots menu and select **Repositories**.
3. Add this repository's address and select **Add**. A "Picnic Desk" card
   appears in the store.
4. Install it, turn on **Show in sidebar**, and start it.
5. Open **Picnic** in the sidebar and sign in with your Picnic account.

The app's Documentation tab explains the rest.

## Remove it

Uninstall the app on its page under **Settings > Apps**, then remove the
address in the same **Repositories** dialog. The app's data folder goes with
the uninstall.

## Update it

Raise `version` in `picnic_desk/config.yaml`, run `npm run build`, commit and
push. Home Assistant then offers the update on the app's page.

To take a newer picnic-web: check it out somewhere, then

    npm run vendor -- /path/to/picnic-web
    node scripts/routes.mjs
    npm run check && npm test && npm run build && npm run test:browser

`npm run check` fails until the route table, the type checks and the built
files agree with the new code, so nothing slips through unnoticed.

## Layout

    repository.yaml          marks this as an app repository
    picnic_desk/             the app: config.yaml, Dockerfile, DOCS.md, and
                             dist/ (the built server and page, committed)
    vendor/picnic-web/       picnic-web's src/lib and src/app/api, unchanged,
                             with the commit they came from in UPSTREAM
    src/server/              the Node server: a stand-in for next/server, the
                             route table, the Picnic session, the desk's own
                             routes (/api/desk/...), the demo shop
    src/ui/                  the page (React)
    tests/                   unit and server tests; tests/browser for the page
    scripts/                 build, route table, vendoring
    picnic-web/              a Dockge stack for running picnic-web itself
    docs/ARCHITECTURE.md     how the parts fit, and why

## Development

Node 22 or newer.

    npm ci                   the exact versions in package-lock.json
    npm run check            types, route table, built files up to date
    npm run lint             ESLint on the desk's own code (not vendor/)
    npm test                 server and unit tests (Picnic is faked)
    npm run build
    npm run test:browser     the page in Chromium, against the demo shop

Try it without a Picnic account, against a small made-up shop:

    npm run build
    PICNIC_DEMO=1 DATA_DIR=./data node picnic_desk/dist/server.mjs

then open <http://localhost:8099>. Any e-mail address and password work; the
password `2fa` walks through the verification-code step with code `123456`.

## Licence

AGPL-3.0, because it contains picnic-web (AGPL-3.0). picnic-api, React and
jsonpath-plus are MIT; their licences ship in
`picnic_desk/dist/THIRD_PARTY_LICENSES.txt`. The sample responses in
`tests/fixtures/picnic` come from
[python-picnic-api2](https://github.com/codesalatdev/python-picnic-api)
(Apache 2.0).
