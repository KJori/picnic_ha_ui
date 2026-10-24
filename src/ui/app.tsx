/**
 * The desk: the shelf on the left under a big search box and a row of tabs,
 * the basket as a till receipt on the right, product pages as a sheet on top.
 */
import { useEffect } from "react";

import { Receipt } from "./components/basket";
import { Boundary, PageBoundary } from "./components/boundary";
import { NextDelivery } from "./components/next-delivery";
import { OpenPayment } from "./components/open-payment";
import { ToastProvider, useToast } from "./components/common";
import { ProductDialog } from "./components/product-dialog";
import { href, navigate, type Route, useRoute, withQuery } from "./lib/router";
import { CheckoutPage } from "./pages/checkout";
import { ListsView } from "./pages/lists";
import { LoginPage } from "./pages/login";
import { CheckView, HistoryView, ListView, SavedView } from "./pages/mine";
import { OrdersView, OrderView, ParcelsView, ParcelView } from "./pages/orders";
import { RecipeView } from "./pages/recipe";
import { RecipesView } from "./pages/recipes";
import { CategoriesView, SearchBox, SearchView } from "./pages/shop";
import { cartModel } from "./state/cart";
import { hear, tell } from "./state/sync";
import { SessionProvider, useSession, useT } from "./state/session";

export function App() {
  return (
    <PageBoundary>
      <SessionProvider>
        <ToastProvider>
          <Gate />
        </ToastProvider>
      </SessionProvider>
    </PageBoundary>
  );
}

function Gate() {
  const { state, outdated } = useSession();
  const { d } = useT();
  if (state?.notYours) {
    return (
      <main className="door">
        <div className="signin" role="alert">
          <h1>{d.notYoursTitle}</h1>
          <p>{d.notYoursText}</p>
        </div>
      </main>
    );
  }
  return (
    <>
      {outdated && (
        <p className="updated" role="status">
          {d.appUpdated}{" "}
          <button type="button" className="secondary" onClick={() => window.location.reload()}>
            {d.reloadPage}
          </button>
        </p>
      )}
      {state?.signedIn ? <Desk /> : <LoginPage />}
      {state?.demo && <p className="demo">{d.demoBadge}</p>}
    </>
  );
}

const REFRESH_AFTER_MS = 10_000;
/** How often a shown tab looks at Picnic's basket for changes made elsewhere. */
const BASKET_POLL_MS = 60_000;

/** Old and picnic-web paths that Picnic's deep links and older bookmarks use. */
function canonical(route: Route): string | null {
  const [first, second] = route.segments;
  if (first === "deliveries") return second ? `/orders/${encodeURIComponent(second)}` : "/orders";
  if (first === "favorites") return "/saved";
  if (first === "product" && second) return `/search?${new URLSearchParams({ product: second })}`;
  if (first === "discover" || first === "cart" || first === "account" || route.path === "/") return "/search";
  return null;
}

function Desk() {
  const route = useRoute();
  const toast = useToast();
  const { t } = useT();

  useEffect(() => {
    const to = canonical(route);
    if (to) navigate(to, true);
  }, [route]);

  useEffect(() => {
    cartModel.onError = () => toast(t.cartMutationError, "error");
    // Every basket this tab gets from Picnic goes to the other tabs, and theirs come here.
    cartModel.onShown = (cart) => tell({ type: "cart", cart });
    const stopHearing = hear("cart", (message) => cartModel.fromOtherTab(message.cart));
    // Changes from the phone app or another computer: a look at Picnic now and then while this tab is shown.
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && !cartModel.busy) void cartModel.refresh();
    }, BASKET_POLL_MS);
    void cartModel.refresh();
    // Changes made in the phone app show up when coming back to this tab.
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > REFRESH_AFTER_MS) {
        last = Date.now();
        void cartModel.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      clearInterval(poll);
      stopHearing();
      cartModel.onShown = () => {};
    };
  }, [toast, t.cartMutationError]);

  // "/" jumps to the search box.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        const box = document.getElementById("q") as HTMLInputElement | null;
        box?.focus();
        box?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const productId = route.query.get("product");

  return (
    <div className="desk">
      <main className="shelf" id="main">
        <Boundary>
          <OpenPayment onCheckout={route.path.startsWith("/checkout")} />
          <NextDelivery />
        </Boundary>
        <header className="top">
          <SearchBox route={route} />
          <Tabs route={route} />
        </header>
        <section className="view">
          <Boundary key={route.path}>
            <View route={route} />
          </Boundary>
        </section>
      </main>
      <aside className="till" aria-label={t.cartTitle}>
        <Boundary>
          <Receipt />
        </Boundary>
      </aside>
      {productId && <ProductDialog key={productId} id={productId} onClose={() => navigate(withQuery(route, { product: null }), true)} />}
    </div>
  );
}

function Tabs({ route }: { route: Route }) {
  const { t, d } = useT();
  const tabs: { to: string; label: string; match: string[] }[] = [
    { to: "/search", label: d.search, match: ["/search"] },
    { to: "/categories", label: d.categories, match: ["/categories", "/pages", "/promotions"] },
    { to: "/list", label: d.pasteList, match: ["/list"] },
    { to: "/history", label: d.boughtBefore, match: ["/history"] },
    { to: "/saved", label: d.starred, match: ["/saved"] },
    { to: "/lists", label: d.lists, match: ["/lists"] },
    { to: "/cookbook", label: d.recipes, match: ["/cookbook", "/recipe"] },
    { to: "/orders", label: t.deliveriesNavLabel, match: ["/orders", "/parcels", "/checkout"] },
  ];
  return (
    <nav className="views" aria-label={t.navMainAriaLabel}>
      {tabs.map((tab) => (
        <a
          key={tab.to}
          href={href(tab.to)}
          aria-current={tab.match.some((m) => route.path === m || route.path.startsWith(`${m}/`)) ? "page" : undefined}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

function View({ route }: { route: Route }) {
  const [first, second] = route.segments;
  switch (first) {
    case "search":
      return <SearchView route={route} />;
    case "categories":
    case "pages":
    case "promotions":
      return <CategoriesView route={route} />;
    case "list":
      return <ListView />;
    case "history":
      return <HistoryView />;
    case "saved":
      return <SavedView />;
    case "lists":
      return <ListsView />;
    case "cookbook":
      return <RecipesView route={route} />;
    case "recipe":
      return second ? <RecipeView key={second} recipeId={second} /> : <RecipesView route={route} />;
    case "orders":
      return second ? <OrderView key={second} deliveryId={second} /> : <OrdersView route={route} />;
    case "parcels":
      return second ? <ParcelView parcelId={second} /> : <ParcelsView />;
    case "checkout":
      return <CheckoutPage returning={second === "return"} />;
    case "check":
      return <CheckView />;
  }
  return canonical(route) ? null : <NotFound />;
}

function NotFound() {
  const { d } = useT();
  return (
    <p className="hint">
      {d.notFound} <a href={href("/search")}>{d.search}</a>
    </p>
  );
}
