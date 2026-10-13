/**
 * Products on the shelf: one cell per product, in a grid or in sections.
 */
import { useEffect, useMemo } from "react";

import { buildSectionId, type BundleThreshold, type Product, type SearchSection, type SliderProduct } from "@/lib/core/types";

import type { SavedProduct } from "../../server/desk-routes";
import { navigate, useRoute, withQuery } from "../lib/router";
import { useCart } from "../state/cart";
import { useT } from "../state/session";
import { toggleStar, useStarred } from "../state/saved";
import { Badge, Img, Price, Stepper, useMoney, useToast } from "./common";

/** Open a product's page over the current screen. */
export function useOpenProduct(): (id: string) => void {
  const route = useRoute();
  return (id: string) => navigate(withQuery(route, { product: id }));
}

/** The price per unit at the current amount, when a "more for less" tier applies. */
export function bundlePrice(ranges: BundleThreshold[] | null | undefined, quantity: number): number | null {
  if (!ranges?.length || quantity === 0) return null;
  return ranges.filter((tier) => tier.quantity <= quantity).at(-1)?.pricePerUnit ?? null;
}

export function StarButton({ product }: { product: SavedProduct }) {
  const { d } = useT();
  const toast = useToast();
  const list = useStarred();
  const on = list?.some((p) => p.id === product.id) ?? false;
  return (
    <button
      type="button"
      className={`star ${on ? "star-on" : ""}`}
      aria-pressed={on}
      aria-label={`${on ? d.unstar : d.star}: ${product.name}`}
      title={on ? d.unstar : d.star}
      onClick={(event) => {
        event.stopPropagation();
        void toggleStar(product, (message) => toast(message, "error"));
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

export function ProductCell({ product }: { product: Product }) {
  const { t, d } = useT();
  const cart = useCart();
  const open = useOpenProduct();
  const money = useMoney();
  const quantity = cart.quantity(product.id);
  const tierPrice = bundlePrice(product.priceRanges, quantity);
  const shownPrice = tierPrice ?? product.displayPrice;
  const nextTier = product.priceRanges?.find((tier) => tier.quantity > quantity);

  const toast = useToast();
  const snapshot: SavedProduct = {
    id: product.id,
    name: product.name,
    imageId: product.imageId,
    unitQuantity: product.unitQuantity,
    displayPrice: product.displayPrice,
  };
  // Keys on a product, as on the old desk: + and - change the amount, s stars it.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if ((event.key === "+" || event.key === "=") && !product.isUnavailable) cart.add(product.id, product.maxCount);
    else if (event.key === "-") cart.remove(product.id);
    else if (event.key === "s") void toggleStar(snapshot, (message) => toast(message, "error"));
    else return;
    event.preventDefault();
  };
  return (
    <article
      className={`cell ${product.isUnavailable ? "cell-unavailable" : ""} ${quantity ? "cell-in-basket" : ""}`}
      data-product={product.id}
      onKeyDown={onKeyDown}
    >
      <button type="button" className="cell-open" onClick={() => open(product.id)} aria-label={`${d.openProduct}: ${product.name}`}>
        <span className="cell-picture">
          <Img id={product.imageId} alt="" />
          {product.promoBadge && product.promoPlacement === "image" && <Badge badge={product.promoBadge} />}
        </span>
      </button>
      <div className="cell-text">
        {product.subtitle && (
          <p className="cell-subtitle" style={product.subtitleColor ? { color: product.subtitleColor } : undefined}>
            {product.subtitleLeadingIcon && "« "}
            {product.subtitle}
            {product.subtitleTrailingIcon && " »"}
          </p>
        )}
        <h3 className="cell-name">
          <button type="button" className="link-like" onClick={() => open(product.id)}>
            {product.namePrefix && <span className="name-prefix">{product.namePrefix} </span>}
            {product.name}
          </button>
        </h3>
        {(product.brand || product.highlight) && (
          <p className="cell-brand">
            {product.flagFallbackImageId && <Img id={product.flagFallbackImageId} size="small" className="flag" />}
            {product.brand}
            {product.highlight && (
              <span className="highlight" style={{ color: product.highlight.color }}>
                {" "}
                {product.highlight.text}
              </span>
            )}
          </p>
        )}
        <p className="cell-unit">
          {product.badges.map((badge, i) => (
            <Badge key={`${badge.variant}-${i}`} badge={badge} />
          ))}
          {product.unitQuantity}
        </p>
        {product.isUnavailable ? (
          <p className="cell-reason">{product.unavailableReason ?? d.unavailable}</p>
        ) : (
          <div className="cell-buy">
            <Price
              cents={shownPrice}
              was={tierPrice !== null && tierPrice < product.displayPrice ? product.displayPrice : product.originalPrice}
              color={product.displayPriceColor}
            />
            {product.promoBadge && product.promoPlacement === "inline" && <Badge badge={product.promoBadge} />}
            <Stepper
              quantity={quantity}
              maxCount={product.maxCount}
              name={product.name}
              onAdd={() => cart.add(product.id, product.maxCount)}
              onRemove={() => cart.remove(product.id)}
            />
          </div>
        )}
        {nextTier && !product.isUnavailable && (
          <p className="cell-tier">
            {t.bundleFromLabel} {nextTier.quantity}: {money(nextTier.pricePerUnit)}
          </p>
        )}
      </div>
      <StarButton product={snapshot} />
    </article>
  );
}

/** Arrow keys move between products; the grid's columns are read from the layout. */
function moveInGrid(event: React.KeyboardEvent<HTMLDivElement>) {
  const keys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 0, ArrowDown: 0 };
  if (!(event.key in keys) || (event.target as HTMLElement).tagName === "INPUT") return;
  const cells = [...event.currentTarget.querySelectorAll<HTMLElement>(":scope > .cell")];
  const current = cells.findIndex((cell) => cell.contains(document.activeElement));
  if (current < 0) return;
  const columns = Math.max(1, cells.filter((cell) => cell.offsetTop === cells[0].offsetTop).length);
  const step = event.key === "ArrowUp" ? -columns : event.key === "ArrowDown" ? columns : keys[event.key];
  const next = cells[current + step];
  if (!next) return;
  event.preventDefault();
  next.querySelector<HTMLElement>(".cell-open")?.focus();
}

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="cells" onKeyDown={moveInGrid}>
      {products.map((product) => (
        <ProductCell key={product.id} product={product} />
      ))}
    </div>
  );
}

/** Search results or a category page: sections with a jump bar, or one grid. */
export function ProductSections({ products, sections }: { products: Product[]; sections: SearchSection[] }) {
  const { t } = useT();
  if (sections.length <= 1) return <ProductGrid products={sections[0]?.products ?? products} />;
  return (
    <>
      <nav className="section-jump" aria-label={t.sectionNavGoTo}>
        {sections.map((section, index) => (
          <a
            key={index}
            href={`#${buildSectionId(index)}`}
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(buildSectionId(index))?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            {section.title}
          </a>
        ))}
      </nav>
      {sections.map((section, index) => (
        <section key={index} id={buildSectionId(index)} className="shelf-section">
          <h3>{section.title}</h3>
          <ProductGrid products={section.products} />
        </section>
      ))}
    </>
  );
}

/** A compact product (similar products, suggestions, replacements). */
export function MiniProduct({ product }: { product: SliderProduct }) {
  const cart = useCart();
  const open = useOpenProduct();
  const quantity = cart.quantity(product.id);
  return (
    <article className="mini" data-product={product.id}>
      <button type="button" className="mini-open" onClick={() => open(product.id)}>
        <Img id={product.imageId} alt="" />
        <span className="mini-name">{product.name}</span>
        <span className="mini-unit">{product.unitQuantity}</span>
      </button>
      <div className="mini-buy">
        <Price cents={product.displayPrice} />
        <Stepper
          quantity={quantity}
          maxCount={product.maxCount}
          name={product.name}
          onAdd={() => cart.add(product.id, product.maxCount)}
          onRemove={() => cart.remove(product.id)}
        />
      </div>
    </article>
  );
}

export function MiniRow({ title, products }: { title: string; products: SliderProduct[] }) {
  const unique = useMemo(() => products.filter((p, i) => products.findIndex((q) => q.id === p.id) === i), [products]);
  if (!unique.length) return null;
  return (
    <section className="mini-row">
      <h3>{title}</h3>
      <div className="mini-list">
        {unique.map((product) => (
          <MiniProduct key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

/** Keeps the page title in step with the screen. */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Picnic` : "Picnic";
  }, [title]);
}
