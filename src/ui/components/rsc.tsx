/**
 * Pages Picnic serves as React Server Components (the category tree,
 * promotion pages), drawn with the same components picnic-web has for them:
 * vertical-list (rows and section titles) and promo-deep-dive-content. A
 * component without a drawing shows only what is inside it.
 */
import { type ReactNode, useMemo } from "react";

import type { Product } from "@/lib/core/types";
import { mapSellableTile } from "@/lib/rsc/map-sellable-tile";
import { readSlotActions, resolveIntents } from "@/lib/rsc/rsc-actions";
import type { RscAction, RscNode, RscPageModel } from "@/lib/rsc/rsc-page-types";

import { navigate } from "../lib/router";
import { useCart } from "../state/cart";
import { useT } from "../state/session";
import { Img } from "./common";
import { ProductGrid } from "./products";

type Context = { tokens: Record<string, string>; run: (actions: RscAction[], title: string) => void };

/** A theme token ("YELLOW2") or a literal colour; anything else is ignored. */
export function resolveColor(tokens: Record<string, string>, value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  if (value in tokens) return tokens[value];
  if (value.startsWith("#") || value.startsWith("rgb")) return value;
  return undefined;
}

export function RscPageView({ page }: { page: RscPageModel }) {
  const cart = useCart();
  const context: Context = {
    tokens: page.tokens,
    run: (actions, title) => {
      for (const intent of resolveIntents(actions, title)) {
        if (intent.type === "navigate") navigate(intent.route);
        else if (intent.modification === "ADD") cart.add(intent.sellingUnitId);
        else cart.remove(intent.sellingUnitId);
      }
    },
  };
  return <Nodes nodes={page.nodes} context={context} />;
}

function Nodes({ nodes, context }: { nodes: RscNode[]; context: Context }): ReactNode {
  return nodes.map((node) => {
    const children = <Nodes nodes={node.children} context={context} />;
    if (node.component === "vertical-list") return <VerticalList key={node.id} node={node} context={context} />;
    if (node.component === "promo-deep-dive-content") return <PromoContent key={node.id} node={node} context={context} />;
    return <div key={node.id} className="rsc-wrap">{children}</div>;
  });
}

function VerticalList({ node, context }: { node: RscNode; context: Context }) {
  const items = Array.isArray(node.props.items) ? (node.props.items as Record<string, unknown>[]) : [];
  const blocks: ReactNode[] = [];
  let group: Record<string, unknown>[] = [];
  const flush = () => {
    if (!group.length) return;
    const rows = group;
    blocks.push(
      <div key={`g${blocks.length}`} className="rows">
        {rows.map((item, i) => (
          <RowItem key={String(item.testID ?? i)} item={item} context={context} />
        ))}
      </div>
    );
    group = [];
  };
  for (const item of items) {
    if (item.type === "section-title") {
      flush();
      if (typeof item.title === "string" && item.title) blocks.push(<h3 key={`t${blocks.length}`}>{item.title}</h3>);
    } else if (item.type === "row-item") {
      group.push(item);
    }
  }
  flush();
  return <div className="rsc-list">{blocks}</div>;
}

function RowItem({ item, context }: { item: Record<string, unknown>; context: Context }) {
  const title = typeof item.title === "string" ? item.title : "";
  const deepLink = typeof item.deeplink === "string" ? item.deeplink : null;
  const imageId = typeof item.image === "string" ? item.image : null;
  const laurel = (item.laurelLeaf as { text?: unknown } | undefined)?.text;
  const laurelText = typeof laurel === "string" && laurel ? laurel : null;
  const label = item.label as { title?: string; backgroundColor?: string; textColor?: string } | undefined;
  const fullTitle = [title, laurelText].filter(Boolean).join(" ");
  const slotActions = readSlotActions(item.interaction, "rowPress");
  const actions: RscAction[] = slotActions.length
    ? slotActions
    : deepLink
      ? [{ type: "open-deeplink", payload: { deeplink: deepLink } }]
      : [];
  const laurelColor = context.tokens.GOLD1 ?? "#95710F";
  return (
    <button type="button" className="row" disabled={!actions.length} onClick={() => context.run(actions, fullTitle)}>
      {imageId && <Img id={imageId} className="row-picture" alt="" />}
      <span className="row-text">
        <span>
          {title}
          {laurelText && <span style={{ color: laurelColor }}> ❦ {laurelText} ❦</span>}
        </span>
        {label?.title && (
          <span
            className="badge"
            style={{
              backgroundColor: resolveColor(context.tokens, label.backgroundColor) ?? "#fbd92b",
              color: resolveColor(context.tokens, label.textColor) ?? "#333333",
            }}
          >
            {label.title}
          </span>
        )}
      </span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

function PromoContent({ node, context }: { node: RscNode; context: Context }) {
  const { t } = useT();
  const tiles = node.props.sellableTiles;
  const products = useMemo(
    () =>
      (Array.isArray(tiles) ? tiles : []).flatMap((tile) => {
        const product = mapSellableTile((tile ?? {}) as Record<string, unknown>, context.tokens);
        return product ? [product] : ([] as Product[]);
      }),
    [tiles, context.tokens]
  );
  if (!products.length) return <p className="empty">{t.noProductsInCategory}</p>;
  return (
    <>
      <p className="count">
        {products.length} {products.length === 1 ? t.productSingular : t.productPlural}
      </p>
      <ProductGrid products={products} />
    </>
  );
}
