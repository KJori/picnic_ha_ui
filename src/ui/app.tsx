/**
 * The desk: the shelf on the left, the basket as a till receipt on the right,
 * product pages over the top.
 */
import { Component, type ReactNode, useEffect } from "react";

import { Receipt } from "./components/basket";
import { ToastProvider, useMoney, useToast } from "./components/common";
import { ProductDialog } from "./components/product-dialog";
import { href, navigate, type Route, useRoute, withQuery } from "./lib/router";
import { CheckoutPage } from "./pages/checkout";
import { LoginPage } from "./pages/login";
import { AccountPage, BasketPage, HistoryPage, ListPage, StarredPage } from "./pages/mine";
import { DeliveriesPage, DeliveryPage, ParcelPage, ParcelsPage } from "./pages/orders";
import { CookbookPage, RecipePage } from "./pages/recipes";
import { CategoryPage, PickedPage, SearchBox, SearchPage, SubcategoryPage } from "./pages/shop";
import { cartModel, useCart } from "./state/cart";
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
  if (!state?.signedIn) return <LoginPage />;
  return <Desk />;
}

const REFRESH_AFTER_MS = 10_000;

function Desk() {
  const route = useRoute();
  const toast = useToast();
  const { t } = useT();

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

  // "/" jumps to the search box, as on the old desk.
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

  const productId = route.segments[0] === "product" ? route.segments[1] : route.query.get("product");
  const fullBasket = route.path === "/cart" || route.path.startsWith("/checkout");

  return (
    <div className={`desk ${fullBasket ? "desk-wide" : ""}`}>
      <header className="top">
        <a className="brand" href={href("/search")} aria-label="Picnic Desk">
          Picnic
        </a>
        <SearchBox route={route} />
        <Nav route={route} />
      </header>
      <main className="shelf" id="main">
        <Boundary key={route.path}>
          <Page route={route} />
        </Boundary>
      </main>
      {!fullBasket && (
        <aside className="till" aria-label={t.cartTitle}>
          <Boundary>
            <Receipt />
          </Boundary>
        </aside>
      )}
      {productId && (
        <ProductDialog
          id={productId}
          onClose={() =>
            route.segments[0] === "product" ? navigate("/search", true) : navigate(withQuery(route, { product: null }), true)
          }
        />
      )}
    </div>
  );
}

function Nav({ route }: { route: Route }) {
  const { t, d } = useT();
  const cart = useCart();
  const money = useMoney();
  const items: { to: string; label: string; match: string[] }[] = [
    { to: "/search", label: d.shop, match: ["/search", "/categories", "/pages", "/product"] },
    { to: "/cookbook", label: t.navCooking, match: ["/cookbook", "/recipe"] },
    { to: "/history", label: d.boughtBefore, match: ["/history"] },
    { to: "/saved", label: d.starred, match: ["/saved"] },
    { to: "/list", label: d.pasteList, match: ["/list"] },
    { to: "/deliveries", label: t.deliveriesNavLabel, match: ["/deliveries", "/parcels"] },
    { to: "/account", label: t.navAccount, match: ["/account"] },
  ];
  return (
    <nav className="views" aria-label={t.navMainAriaLabel}>
      {items.map((item) => (
        <a
          key={item.to}
          href={href(item.to)}
          aria-current={item.match.some((m) => route.path === m || route.path.startsWith(`${m}/`)) ? "page" : undefined}
        >
          {item.label}
        </a>
      ))}
      <a className="nav-basket" href={href("/cart")} aria-current={route.path === "/cart" ? "page" : undefined}>
        {t.navCart}
        {cart.cart && cart.count > 0 && (
          <span className="nav-total">
            {cart.count} · {money(cart.cart.totalPrice)}
          </span>
        )}
      </a>
    </nav>
  );
}

function Page({ route }: { route: Route }) {
  const [first, second, third] = route.segments;
  switch (first) {
    case undefined:
    case "search":
    case "discover":
    case "product":
      return <SearchPage route={first === "search" ? route : { ...route, query: new URLSearchParams() }} />;
    case "categories":
      if (second && third) return <SubcategoryPage categoryId={second} subcategoryId={third} />;
      if (second) return <CategoryPage categoryId={second} />;
      break;
    case "pages":
      return <PickedPage route={route} />;
    case "cookbook":
      return <CookbookPage />;
    case "recipe":
      if (second) return <RecipePage key={second} recipeId={second} />;
      break;
    case "cart":
      return <BasketPage />;
    case "checkout":
      return <CheckoutPage returning={second === "return"} />;
    case "deliveries":
      return second ? <DeliveryPage key={second} deliveryId={second} /> : <DeliveriesPage route={route} />;
    case "parcels":
      return second ? <ParcelPage parcelId={second} /> : <ParcelsPage />;
    case "history":
      return <HistoryPage />;
    case "saved":
    case "favorites":
      return <StarredPage />;
    case "list":
      return <ListPage />;
    case "account":
      return <AccountPage />;
  }
  return <NotFound />;
}

function NotFound() {
  const { d } = useT();
  return (
    <p className="empty">
      {d.notFound} <a href={href("/search")}>{d.shop} ›</a>
    </p>
  );
}

/** A screen that breaks shows a message and a way back, not a blank page. */
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
      <div className="error-view" role="alert">
        <p>Something went wrong on this screen: {this.state.error.message}</p>
        <button type="button" className="button" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
