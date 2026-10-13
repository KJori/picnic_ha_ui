# How Picnic Desk is put together

## The idea

Picnic publishes nothing about its service. The most complete open-source
knowledge of it is [picnic-web](https://github.com/MRVDH/picnic-web): a Next.js
app whose API routes (`src/app/api/**/route.ts`) call Picnic through
[picnic-api](https://github.com/MRVDH/picnic-api) and turn Picnic's pages
into plain typed JSON (`src/lib`). Its author uses it against the live service
and fixes it when Picnic changes.

Picnic Desk takes those two folders unchanged (`vendor/picnic-web`, with the
upstream commit in `UPSTREAM`) and runs the routes on a plain Node HTTP server.
Everything about talking to Picnic, reading its answers and telling a dead
session from a rate limit is therefore picnic-web's code, not a second
implementation that could drift.

## Running Next.js routes without Next.js

The routes use a small part of `next/server`: `NextRequest.json()`,
`nextUrl.searchParams`, `nextUrl.origin`, `cookies.get`, `NextResponse.json`,
`new NextResponse` and `response.cookies.set`. `src/server/next-server.ts`
provides exactly that, and `tests/next-server.test.ts` scans the vendored code
so a route that starts using more fails the tests.

`scripts/routes.mjs` writes `src/server/routes.generated.ts`, one entry per
route file, with the routes left out on purpose (wallet, family, referral)
listed in the script. `tests/routes.test.ts` checks the table against the
folder.

## The Picnic session

picnic-web keeps the Picnic token in a browser cookie. Here the server keeps
it in `/data/auth.json` and adds the cookies to each request before handing it
to a route; cookies a route sets (sign-in, sign-out, country) are taken out of
the response and applied to the stored session. No token reaches a browser,
and every browser in the household shares the one basket. The half-finished
token of a sign-in with a verification code also stays on the server.

## Home Assistant

The app is served through ingress, under `/api/hassio_ingress/<token>/`, so
the page uses only relative addresses and routes in the `#fragment`. The
server answers only Home Assistant's ingress gateway (172.30.32.2).

Checkout builds the bank's return address from `nextUrl.origin`; the page
sends its own address (`X-Desk-Base`) so that address points back into Home
Assistant. Because Home Assistant may not let the bank's redirect in, the bank
opens in a new tab and the original tab watches the payment and confirms the
order.

## The page

`src/ui` is a React app with its own design (the desk: shelf and receipt). It
imports picnic-web's types, translations and pure helpers (deep-link routing,
the RSC action resolver, the tracking parser, PML markdown) so it reads the
routes' answers the way picnic-web's own pages do. TypeScript checks it
against those types.

The basket (`src/ui/state/cart.ts`) shows clicks at once, merges clicks on a
product that is still on its way into one request, ignores answers older than
one already shown, and fetches the basket again after a failure.

## Robustness added on top

- A time limit on every call to Picnic (picnic-api has none).
- A route that throws gives a 502 instead of a crash; any 401 marks the
  session as expired.
- Pictures load straight from Picnic like picnic-web; when one fails, the
  server tries the other known variants and keeps track of what works
  (`src/server/pictures.ts`), and refuses anything that is not a picture.
- Recipe card prices are worked out two at a time and kept for a day.
- Request bodies are capped; static files cannot leave their folder.

## Tests

- `npm test`: the stand-in, the route table, the server around the real
  routes with Picnic faked at the fetch level (sign-in with and without a
  code, expired sessions, rate limiting, what is stored), the basket model,
  the demo shop and small helpers.
- `npm run test:browser`: the built app in Chromium, behind a stand-in for
  ingress, against the demo shop: every screen, checkout included, with no
  console errors, no server errors and no requests outside the app.
- The demo shop (`src/server/demo`) is typed with picnic-web's types, so it
  cannot drift from what the real routes return.

What cannot be tested here is Picnic itself. The **Run the check** button
under Account tries the read-only parts against the live service.
