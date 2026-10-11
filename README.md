# Picnic Desk

A Home Assistant app (add-on) that puts a desktop screen for filling your
Picnic basket in the sidebar: search, shortcuts for the things you always buy,
a pasted shopping list, what you bought before, and Picnic's recipes.

Picnic only has a phone app and no official programming interface. This talks
to the same service the phone app uses, through the unofficial
[python-picnic-api2](https://github.com/codesalatdev/python-picnic-api)
library that Home Assistant's own Picnic integration uses. It is not
affiliated with Picnic and can break when Picnic changes its service.

It fills the basket. Choosing a delivery slot and paying stay in the Picnic app.

## Add it to Home Assistant

HACS cannot install apps, so this is an app repository instead. It is added
and removed with one address, in the same way.

1. In Home Assistant go to **Settings > Apps** and select **Install app**.
2. In the top-right corner open the three dots menu and select **Repositories**.
3. Add `https://github.com/KJori/picnic_ha_ui` and select **Add**. A "Picnic
   Desk" card appears in the store.
4. Install it, turn on **Show in sidebar**, and start it. Home Assistant builds
   it on your machine, which takes a few minutes the first time.
5. Open **Picnic** in the sidebar and sign in with your Picnic account.

After the first sign-in, use **Check what works with Picnic** at the bottom of
the basket. It tries every read-only part against the real service and lists
what works. Nothing in your basket changes.

## Remove it

Uninstall the app on its page under **Settings > Apps**, then open the same
**Repositories** dialog and remove the address. The app's data folder (session
token, shortcuts, saved products) goes with the uninstall.

## Update it

Change the files, raise `version` in `picnic_desk/config.yaml`, and push.
Home Assistant then offers the update on the app's page (use **Check for
updates** in the store's three dots menu if it does not show yet).

## Layout

    repository.yaml          marks this as an app repository
    picnic_desk/             the app: config.yaml, Dockerfile, DOCS.md, app/
    tests/                   unit tests and sample Picnic responses
    docs/PICNIC_CALLS.md     every Picnic call used, where it is documented,
                             and how it was tested
    .github/workflows/       runs the tests and builds the image on every push

## Tests

    pip install -r picnic_desk/requirements.txt
    python -m unittest discover tests

Try it without a Picnic account, against a small made-up shop:

    PICNIC_DEMO=1 DATA_DIR=./data python picnic_desk/app/server.py

then open http://localhost:8099. Any email and password work; the password
`2fa` walks through the verification-code step with code `123456`.

## Credit

The recipe calls and page shapes were worked out by the authors of
[MRVDH/picnic-api](https://github.com/MRVDH/picnic-api) and
[ivo-toby/mcp-picnic](https://github.com/ivo-toby/mcp-picnic). The sample
responses in `tests/fixtures/picnic` come from python-picnic-api2 (Apache 2.0).
