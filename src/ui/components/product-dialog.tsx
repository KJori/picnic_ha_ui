/**
 * A product's page, as a sheet over the desk so the shelf keeps its place.
 */
import { Fragment, type ReactNode, useState } from "react";

import type { AllergenBadge, NutritionRow, ProductDetail } from "@/lib/core/types";
import { renderPmlMarkdown } from "@/lib/pml/parse-pml-markdown";
import { renderMarkdownBold } from "@/lib/pml/render-markdown-bold";

import { api } from "../lib/api";
import { useCart } from "../state/cart";
import { useT } from "../state/session";
import { Boundary } from "./boundary";
import { Dialog, Img, Loaded, PicnicLabel, Price, Stepper, useLoad, useMoney } from "./common";
import { fromSlider, ProductGrid, StarButton, useTakeOut } from "./products";

/** Icons Picnic names for highlights, as picnic-web shows them. */
const HIGHLIGHT_ICONS: Record<string, string> = {
  starsOutlined: "✨",
  pin: "📌",
  snowflake: "❄️",
  clock: "🕒",
  leaf: "🌿",
  leafOutlined: "🌿",
  freshLeaf: "🌿",
  qualityLeaf: "🌿",
  heart: "❤️",
  fire: "🔥",
  check: "✅",
  checkCircle: "✅",
  checkCircleOutlined: "✅",
  checkOutlined: "✅",
  verified: "✅",
  star: "⭐",
  info: "ℹ️",
  infoCircle: "ℹ️",
  trophy: "🏆",
  crown: "👑",
  priceTag: "🏷️",
  tag: "🏷️",
  shieldCheck: "🛡️",
  calendar: "📅",
  apple: "🍎",
  whisk: "🍵",
  list: "📋",
};

/** Section titles that hold the nutrition table, in Picnic's three languages. */
const NUTRITION_TITLE = /voedingswaarde|nährwert|naehrwert|valeurs? nutritionnel|nutrition/i;

export function ProductDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { d } = useT();
  const [load, reload] = useLoad<ProductDetail>(id, (signal) => api(`product/${encodeURIComponent(id)}`, { signal }));
  const title = (load.status === "ready" && load.data?.name) || d.product;
  return (
    <Dialog title={title} onClose={onClose} className="product-sheet">
      <Boundary>
        <Loaded load={load} retry={reload}>
          {(product) => <ProductView product={product} />}
        </Loaded>
      </Boundary>
      <p className="hint">
        <a className="quiet" href={`api/desk/raw?${new URLSearchParams({ page: `product-details-page-root?id=${id}` })}`} download>
          {d.downloadRaw}
        </a>
      </p>
    </Dialog>
  );
}

function ProductView({ product }: { product: ProductDetail }) {
  const { t, d } = useT();
  const cart = useCart();
  const takeOut = useTakeOut();
  const money = useMoney();
  const quantity = cart.quantity(product.id);
  const [picture, setPicture] = useState(0);
  const pictures = product.imageIds.length ? product.imageIds : [""];
  const hasAllergens = product.allergens.confirmed.length > 0 || product.allergens.mayContain.length > 0;
  const nutritionSection = product.nutritionRows.length
    ? product.infoSections.findIndex((s) => NUTRITION_TITLE.test(s.title))
    : -1;
  const snapshot = {
    id: product.id,
    name: product.name,
    imageId: product.imageIds[0] ?? "",
    unitQuantity: product.unitQuantity,
    displayPrice: product.displayPrice,
  };

  return (
    <>
      <div className="sheet-head">
        <div className="gallery">
          <Img id={pictures[picture]} name={product.name} />
          {pictures.length > 1 && (
            <div className="thumbs">
              {pictures.map((imageId, index) => (
                <button
                  key={imageId + index}
                  type="button"
                  className="thumb"
                  aria-pressed={index === picture}
                  aria-label={`${d.picture} ${index + 1}`}
                  onClick={() => setPicture(index)}
                >
                  <Img id={imageId} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="words">
          {product.brand && <p className="brand">{product.brand}</p>}
          <h2 className="name">{product.name}</h2>
          {product.labels.length > 0 && (
            <p className="meta">
              {product.labels.map((label, i) => (
                <PicnicLabel key={i} text={label.text} fg={label.textColor} bg={label.backgroundColor} />
              ))}
            </p>
          )}
          <p className="hint">
            {[product.unitQuantity, product.unitPrice, product.categoryTag?.text].filter(Boolean).join(" · ")}
          </p>
          <div className="buy">
            <span className="pricing">
              <Price cents={product.displayPrice} was={product.originalPrice} color={product.displayPriceColor} />
              {product.promotion && <span className="offer">{product.promotion.label}</span>}
            </span>
            <span className="buy-right">
              <Stepper
                quantity={quantity}
                maxCount={product.maxCount}
                name={product.name}
                onAdd={() => cart.add(product.id, product.maxCount)}
                onRemove={() => takeOut(product.id, product.name, product.maxCount)}
              />
              <StarButton product={snapshot} />
            </span>
          </div>
          {product.bundles.length > 0 && (
            <div className="chips bundles">
              {product.bundles.map((bundle) => (
                <button
                  key={bundle.id}
                  type="button"
                  className="chip"
                  aria-pressed={quantity >= bundle.quantity}
                  onClick={() => cart.set(product.id, Math.max(quantity, bundle.quantity), product.maxCount)}
                >
                  {d.eachFrom.replace("{price}", money(bundle.pricePerUnit)).replace("{n}", String(bundle.quantity))}
                </button>
              ))}
            </div>
          )}
          {product.highlights.length > 0 && (
            <ul className="highlights">
              {product.highlights.map((item, i) => (
                <li key={i}>
                  {item.iconKey && <span aria-hidden="true">{HIGHLIGHT_ICONS[item.iconKey] ?? "•"} </span>}
                  {renderPmlMarkdown(item.text)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {product.description && <p className="description">{renderMarkdownBold(product.description)}</p>}

      {hasAllergens && (
        <div className="allergens">
          <AllergenList label={t.recipeAllergens} badges={product.allergens.confirmed} />
          <AllergenList label={t.recipeMayContain} badges={product.allergens.mayContain} />
        </div>
      )}

      {product.infoSections.map((section, index) => (
        <Fold key={section.title + index} title={section.title} open={index === 0}>
          {index === nutritionSection ? <NutritionTable rows={product.nutritionRows} /> : <RichText text={section.content} />}
        </Fold>
      ))}
      {nutritionSection < 0 && product.nutritionRows.length > 0 && (
        <Fold title={t.recipeNutrition}>
          <NutritionTable rows={product.nutritionRows} />
        </Fold>
      )}

      {product.similarProducts.length > 0 && (
        <section className="group">
          <h3>{t.similarProductsTitle}</h3>
          <ProductGrid products={product.similarProducts.map(fromSlider)} />
        </section>
      )}
    </>
  );
}

export function AllergenList({ label, badges }: { label: string; badges: AllergenBadge[] }) {
  if (!badges.length) return null;
  return (
    <p>
      <strong>{label}:</strong> {badges.map((badge) => badge.text).join(", ")}
    </p>
  );
}

export function NutritionTable({ rows }: { rows: NutritionRow[] }) {
  if (!rows.length) return null;
  return (
    <table className="nutrition">
      <tbody>
        {rows.map((row, i) => (
          // Picnic shades some rows for its white app; here a shade that works in both themes.
          <tr key={i} className={`${row.isCategory ? "" : "sub"} ${row.backgroundColor ? "shaded" : ""}`}>
            <th scope="row">{row.label}</th>
            <td>{row.value ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Fold({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="fold" open={open}>
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}

/**
 * Text from a fold-out section: **bold**, line breaks, and markdown tables
 * ("| a | b |" lines), which Picnic uses for nutrition and the like.
 */
function RichText({ text }: { text: string }) {
  const blocks: { table: boolean; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    const table = /^\s*\|.*\|\s*$/.test(line);
    const last = blocks.at(-1);
    if (last && last.table === table) last.lines.push(line);
    else blocks.push({ table, lines: [line] });
  }
  return (
    <>
      {blocks.map((block, i) =>
        block.table ? (
          <table key={i} className="nutrition">
            <tbody>
              {block.lines
                .filter((line) => !/^\s*\|[\s:|-]+\|\s*$/.test(line))
                .map((line, r) => (
                  <tr key={r}>
                    {line
                      .trim()
                      .slice(1, -1)
                      .split("|")
                      .map((cell, c) => (
                        <Fragment key={c}>{c === 0 ? <th scope="row">{renderMarkdownBold(cell.trim())}</th> : <td>{renderMarkdownBold(cell.trim())}</td>}</Fragment>
                      ))}
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p key={i} className="prose">
            {renderMarkdownBold(block.lines.join("\n").trim())}
          </p>
        )
      )}
    </>
  );
}
