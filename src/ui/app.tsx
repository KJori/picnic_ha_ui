/**
 * The desk: the shelf on the left under a big search box and a row of tabs,
 * the basket as a till receipt on the right, product pages as a sheet on top.
 */
import { Component, type ReactNode, useEffect } from "react";

import { Receipt } from "./components/basket";
import { ToastProvider, useToast } from "./components/common";
import { ProductDialog } from "./components/product-dialog";
import { href, navigate, type Route, useRoute, withQuery } from "./lib/router";
import { CheckoutPage } from "./pages/checkout";
import { LoginPage } from "./pages/login";
import { CheckView, HistoryView, ListView, SavedView } from "./pages/mine";
import { OrdersView, OrderView, ParcelsView, ParcelView } from "./pages/orders";
import { RecipesView, RecipeView } from "./pages/recipes";
import { CategoriesView, SearchBox, SearchView } from "./pages/shop";
import { cartModel } from "./state/cart";
import { SessionProvider, useSession, useT } from "./state/session";

export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </SessionProvider>
  );
}

function Gate() {
  const { state } = useSession();
  const { d } = useT();
  return (
    <>
      {state?.signedIn ? <Desk /> : <LoginPage />}
      {state?.demo && <p className="demo">{d.demoBadge}</p>}
    </>
  );
}

const REFRESH_AFTER_MS = 10_000;

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
      {productId && <ProductDialog id={productId} onClose={() => navigate(withQuery(route, { product: null }), true)} />}
    </div>
  );
}

function Tabs({ route }: { route: Route }) {
  const { t, d } = useT();
  const tabs: { to: string; label: string; match: string[] }[] = [
    { to: "/search", label: d.search, match: ["/search"] },
    { to: "/categories", label: d.categories, match: ["/categories", "/pages"] },
    { to: "/list", label: d.pasteList, match: ["/list"] },
    { to: "/history", label: d.boughtBefore, match: ["/history"] },
    { to: "/saved", label: d.starred, match: ["/saved"] },
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
      return <CategoriesView route={route} />;
    case "list":
      return <ListView />;
    case "history":
      return <HistoryView />;
    case "saved":
      return <SavedView />;
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

/** A view that breaks shows a message and a way back, not a blank shelf. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[Picnic Desk]", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="trouble" role="alert">
        <p>Something went wrong here: {this.state.error.message}</p>
        <button type="button" className="secondary" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
