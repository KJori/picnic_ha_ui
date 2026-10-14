/**
 * Pages Picnic serves as React Server Components, laid out for a desk.
 *
 * The category tree (category-tree-root) becomes a column of aisles on the
 * left of the shelf instead of the app's full-screen list. Other pages
 * (promotions) render their products on the shelf. What a row does when
 * clicked is decided by picnic-web's own action resolver.
 */
import { useMemo } from "react";

import type { Product } from "@/lib/core/types";
import { mapSellableTile } from "@/lib/rsc/map-sellable-tile";
import { readSlotActions, resolveIntents } from "@/lib/rsc/rsc-actions";
import type { RscAction, RscNode, RscPageModel } from "@/lib/rsc/rsc-page-types";

import { href, navigate, type Route } from "../lib/router";
import { useCart } from "../state/cart";
import { useT } from "../state/session";
import { Img } from "./common";
import { ProductGrid } from "./products";

/** A theme token ("YELLOW2") or a literal colour; anything else is ignored. */
export function resolveColor(tokens: Record<string, string>, value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  if (value in tokens) return tokens[value];
  if (value.startsWith("#") || value.startsWith("rgb")) return value;
  return undefined;
}

type Row =
  | { kind: "title"; title: string }
  | { kind: "row"; key: string; title: string; image: string | null; label?: { text: string; bg?: string; fg?: string }; actions: RscAction[]; route: string | null };

/** Every row and heading of the page's vertical lists, in order. */
export function readRows(page: RscPageModel): Row[] {
  const rows: Row[] = [];
  const walk = (nodes: RscNode[]) => {
    for (const node of nodes) {
      if (node.component === "vertical-list" && Array.isArray(node.props.items)) {
        for (const [index, raw] of (node.props.items as Record<string, unknown>[]).entries()) {
          const title = typeof raw.title === "string" ? raw.title : "";
          if (raw.type === "section-title" && title) rows.push({ kind: "title", title });
          if (raw.type !== "row-item") continue;
          const laurel = (raw.laurelLeaf as { text?: unknown } | undefined)?.text;
          const full = [title, typeof laurel === "string" ? laurel : ""].filter(Boolean).join(" ");
          const slot = readSlotActions(raw.interaction, "rowPress");
          const actions: RscAction[] = slot.length
            ? slot
            : typeof raw.deeplink === "string"
              ? [{ type: "open-deeplink", payload: { deeplink: raw.deeplink } }]
              : [];
          const navigation = resolveIntents(actions, full).find((i) => i.type === "navigate");
          const label = raw.label as { title?: string; backgroundColor?: string; textColor?: string } | undefined;
          rows.push({
            kind: "row",
            key: String(raw.testID ?? `${node.id}-${index}`),
            title: full,
            image: typeof raw.image === "string" ? raw.image : null,
            label: label?.title
              ? {
                  text: label.title,
                  bg: resolveColor(page.tokens, label.backgroundColor),
                  fg: resolveColor(page.tokens, label.textColor),
                }
              : undefined,
            actions,
            route: navigation && navigation.type === "navigate" ? navigation.route : null,
          });
        }
      }
      walk(node.children);
    }
  };
  walk(page.nodes);
  return rows;
}

/** Is `rowRoute` the place the shelf shows now? */
function isHere(rowRoute: string | null, route: Route): boolean {
  if (!rowRoute) return false;
  const [path, search = ""] = rowRoute.split("?");
  if (path === "/pages") return route.path === "/pages" && new URLSearchParams(search).get("pageId") === route.query.get("pageId");
  return route.path === path || route.path.startsWith(`${path}/`);
}

export function Aisles({ page, route }: { page: RscPageModel; route: Route }) {
  const cart = useCart();
  const rows = useMemo(() => readRows(page), [page]);
  return (
    <nav className="aisles">
      {rows.map((row, index) =>
        row.kind === "title" ? (
          <h3 key={`t${index}`}>{row.title}</h3>
        ) : (
          <a
            key={row.key}
            className="aisle"
            href={row.route ? href(row.route) : undefined}
            aria-current={isHere(row.route, route) ? "page" : undefined}
            onClick={(event) => {
              // Rows can also change the basket; picnic-web's resolver says what to do.
              event.preventDefault();
              for (const intent of resolveIntents(row.actions, row.title)) {
                if (intent.type === "navigate") navigate(intent.route);
                else if (intent.modification === "ADD") cart.add(intent.sellingUnitId);
                else cart.remove(intent.sellingUnitId);
              }
            }}
          >
            {row.image && <Img id={row.image} name={row.title} />}
            <span>{row.title}</span>
            {row.label && (
              <span className="offer" style={{ backgroundColor: row.label.bg, color: row.label.fg }}>
                {row.label.text}
              </span>
            )}
          </a>
        )
      )}
    </nav>
  );
}

/** A page Picnic serves as RSC, on the shelf: its products, or its rows as aisles. */
export function RscPageView({ page, route }: { page: RscPageModel; route: Route }) {
  const { t } = useT();
  const products = useMemo(() => {
    const found: Product[] = [];
    const walk = (nodes: RscNode[]) => {
      for (const node of nodes) {
        if (node.component === "promo-deep-dive-content" && Array.isArray(node.props.sellableTiles)) {
          for (const tile of node.props.sellableTiles) {
            const product = mapSellableTile((tile ?? {}) as Record<string, unknown>, page.tokens);
            if (product) found.push(product);
          }
        }
        walk(node.children);
      }
    };
    walk(page.nodes);
    return found;
  }, [page]);
  if (products.length) {
    return (
      <>
        <p className="hint">
          {products.length} {products.length === 1 ? t.productSingular : t.productPlural}
        </p>
        <ProductGrid products={products} />
      </>
    );
  }
  if (readRows(page).length) return <Aisles page={page} route={route} />;
  return <p className="hint">{t.noProductsInCategory}</p>;
}
