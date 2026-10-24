/**
 * The shelf: products in square cells that share their edges, as on the
 * original desk. Every list of products on the page (search, categories,
 * bought before, starred, similar products, replacements) uses these.
 */
import type { KeyboardEvent } from "react";

import type { CartItem, Product, SearchSection, SliderProduct } from "@/lib/core/types";

import type { SavedProduct } from "../../server/desk-routes";
import { picnicInk } from "../lib/colour";
import { type SortOrder, sortProducts, unitPrice } from "../lib/unit-price";
import { navigate, useRoute, withQuery } from "../lib/router";
import { useCart } from "../state/cart";
import { toggleStar, useStarred } from "../state/saved";
import { setSortOrder, useSortOrder } from "../state/sort";
import { useT } from "../state/session";
import { Badge, Img, Price, Stepper, useMoney, useToast } from "./common";

/** Open a product's page over the current screen. */
/**
 * One fewer of a product. When that takes it out of the basket, a notice
 * offers to put it back: easy to do by accident with a quick click.
 */
export function useTakeOut(): (productId: string, name: string, maxCount: number) => void {
  const cart = useCart();
  const toast = useToast();
  const { d } = useT();
  return (productId, name, maxCount) => {
    const before = cart.quantity(productId);
    if (!before) return;
    cart.remove(productId);
    if (before === 1) {
      toast(d.removedOne.replace("{name}", name), "info", { label: d.undo, run: () => cart.add(productId, maxCount, 1) });
    }
  };
}

export function useOpenProduct(): (id: string) => void {
  const route = useRoute();
  return (id: string) => navigate(withQuery(route, { product: id }));
}

/** The price per unit at an amount, when a "more for less" tier applies. */
function bundlePrice(ranges: Product["priceRanges"], quantity: number): number | null {
  if (!ranges?.length || quantity === 0) return null;
  return ranges.filter((tier) => tier.quantity <= quantity).at(-1)?.pricePerUnit ?? null;
}

// ─── Other shapes as shelf products ──────────────────────────────────────────

const blank: Omit<Product, "id" | "name" | "imageId" | "displayPrice" | "unitQuantity" | "maxCount"> = {
  namePrefix: null,
  subtitle: null,
  subtitleColor: null,
  subtitleLeadingIcon: null,
  subtitleTrailingIcon: null,
  brand: null,
  highlight: null,
  flagIconKey: null,
  flagFallbackImageId: null,
  originalPrice: null,
  displayPriceColor: null,
  priceRanges: null,
  badges: [],
  promoBadge: null,
  promoPlacement: null,
  isUnavailable: false,
  unavailableReason: null,
};

/** A line of a past order; its price is what was paid per unit then. */
export const fromCartItem = (item: CartItem): Product => ({
  ...blank,
  id: item.productId,
  name: item.name,
  imageId: item.imageId,
  unitQuantity: item.unitQuantity,
  displayPrice: item.quantity ? Math.round(item.displayPrice / item.quantity) : item.displayPrice,
  maxCount: item.maxCount || 99,
  badges: item.badges,
});

export const fromSaved = (saved: SavedProduct): Product => ({
  ...blank,
  ...saved,
  maxCount: 99,
});

export const fromSlider = (slider: SliderProduct): Product => ({ ...blank, ...slider, maxCount: slider.maxCount || 99 });

// ─── One product ─────────────────────────────────────────────────────────────

const STAR_PATH = "M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z";

export function StarButton({ product }: { product: SavedProduct }) {
  const { d } = useT();
  const toast = useToast();
  const list = useStarred();
  const on = list?.some((p) => p.id === product.id) ?? false;
  return (
    <button
      type="button"
      className="star"
      aria-pressed={on}
      aria-label={`${on ? d.unstar : d.star}: ${product.name}`}
      title={on ? d.unstar : d.star}
      onClick={(event) => {
        event.stopPropagation();
        void toggleStar(product, (message) => toast(message, "error"));
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={STAR_PATH} />
      </svg>
    </button>
  );
}

export function ProductCell({
  product,
  want = 1,
  note,
  onAdd,
}: {
  product: Product;
  want?: number;
  note?: string;
  /** Called on every "+" (a pasted line remembers what was chosen for it). */
  onAdd?: () => void;
}) {
  const { t, d } = useT();
  const cart = useCart();
  const open = useOpenProduct();
  const toast = useToast();
  const money = useMoney();
  const quantity = cart.quantity(product.id);
  const tierPrice = bundlePrice(product.priceRanges, quantity);
  const snapshot: SavedProduct = {
    id: product.id,
    name: product.name,
    imageId: product.imageId,
    unitQuantity: product.unitQuantity,
    displayPrice: product.displayPrice,
  };
  const add = () => {
    onAdd?.();
    cart.add(product.id, product.maxCount, quantity === 0 ? want : 1);
  };
  const takeOut = useTakeOut();
  const remove = () => takeOut(product.id, product.name, product.maxCount);

  // Keys on a product, as on the old desk.
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (key === "Enter" || key === "i") open(product.id);
    else if ((key === "+" || key === "=") && !product.isUnavailable) add();
    else if (key === "-" || key === "_") remove();
    else if (key === "s") void toggleStar(snapshot, (message) => toast(message, "error"));
    else if (key.startsWith("Arrow")) {
      const cells = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(":scope > .product") ?? [])];
      const index = cells.indexOf(event.currentTarget);
      const columns = Math.max(1, cells.filter((cell) => cell.offsetTop === cells[0].offsetTop).length);
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[key] ?? 0;
      cells[index + step]?.focus();
    } else return;
    event.preventDefault();
  };

  const tiers = (product.priceRanges ?? []).map((tier) => d.eachFrom.replace("{price}", money(tier.pricePerUnit)).replace("{n}", String(tier.quantity)));
  const perUnit = unitPrice(product.displayPrice, product.unitQuantity);
  const per = perUnit && { kg: d.perKg, l: d.perL, piece: d.perPiece }[perUnit.per].replace("{price}", money(perUnit.cents));
  const meta = [product.brand, product.unitQuantity, per, ...tiers, note].filter(Boolean).join(", ");

  return (
    <li
      className={`product ${quantity ? "in-basket" : ""} ${product.isUnavailable ? "unavailable" : ""}`}
      data-product={product.id}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button")) open(product.id);
      }}
      aria-label={product.name}
    >
      <Img id={product.imageId} name={product.name} />
      <h3 className="name">
        {product.namePrefix && <span className="prefix">{product.namePrefix} </span>}
        {product.name}
      </h3>
      <p className="meta">
        {product.promoBadge && <Badge badge={product.promoBadge} />}
        {product.badges.map((badge, i) => (
          <Badge key={i} badge={badge} />
        ))}
        {product.highlight && <span {...picnicInk(product.highlight.color)}>{product.highlight.text} </span>}
        {meta}
      </p>
      <div className="buy">
        {product.isUnavailable ? (
          <span className="gone">{product.unavailableReason ?? t.recipeEditUnavailable}</span>
        ) : (
          <>
            <Price
              cents={tierPrice ?? product.displayPrice}
              was={tierPrice !== null && tierPrice < product.displayPrice ? product.displayPrice : product.originalPrice}
              color={product.displayPriceColor}
            />
            <Stepper quantity={quantity} maxCount={product.maxCount} name={product.name} want={want} onAdd={add} onRemove={remove} />
          </>
        )}
      </div>
      <StarButton product={snapshot} />
    </li>
  );
}

export function ProductGrid({
  products,
  want,
  notes,
  sortable = false,
}: {
  products: Product[];
  want?: (p: Product) => number;
  notes?: (p: Product) => string | undefined;
  /** Follow the order chosen above the results (Picnic's, price, price per kg or litre). */
  sortable?: boolean;
}) {
  const order = useSortOrder();
  const seen = new Set<string>();
  const unique = products.filter((p) => !seen.has(p.id) && seen.add(p.id));
  if (sortable) unique.splice(0, unique.length, ...sortProducts(unique, order));
  return (
    <ul className="products">
      {unique.map((product) => (
        <ProductCell key={product.id} product={product} want={want?.(product)} note={notes?.(product)} />
      ))}
    </ul>
  );
}

/**
 * Results in Picnic's sections ("Cherrytomaten", "Biologisch"), with a row of
 * jumps when there are several. Sorted by price, the sections make way for
 * one row of everything, cheapest first.
 */
export function ProductSections({ products, sections }: { products: Product[]; sections: SearchSection[] }) {
  const order = useSortOrder();
  if (order !== "picnic" || sections.length <= 1) {
    const all = order !== "picnic" && sections.length > 1 ? sections.flatMap((s) => s.products) : (sections[0]?.products ?? products);
    return (
      <>
        <SortChoice />
        <ProductGrid products={all} sortable />
      </>
    );
  }
  const id = (index: number) => `section-${index}`;
  return (
    <>
      <SortChoice />
      <div className="chips jumps">
        {sections.map((section, index) =>
          // A section Picnic shows without a header gets no jump either.
          section.title ? (
            <button
              key={index}
              type="button"
              className="chip"
              onClick={() => document.getElementById(id(index))?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              {section.title}
            </button>
          ) : null
        )}
      </div>
      {sections.map((section, index) => (
        <section key={index} id={id(index)} className="group">
          {section.title && <h3>{section.title}</h3>}
          <ProductGrid products={section.products} />
        </section>
      ))}
    </>
  );
}

/** How results are ordered: Picnic's own order, by price, or by price per kilo or litre. */
export function SortChoice() {
  const { d } = useT();
  const order = useSortOrder();
  const options: [SortOrder, string][] = [
    ["picnic", d.sortPicnic],
    ["price", d.sortPrice],
    ["unit", d.sortUnit],
  ];
  return (
    <div className="chips sort" role="group" aria-label={d.sortBy}>
      <span className="hint-inline">{d.sortBy}:</span>
      {options.map(([value, label]) => (
        <button key={value} type="button" className="chip" aria-pressed={order === value} onClick={() => setSortOrder(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}
