/**
 * A product's page, shown over the shelf so the shelf keeps its place.
 */
import { Fragment, type ReactNode, useState } from "react";

import type { AllergenBadge, NutritionRow, ProductDetail } from "@/lib/core/types";
import { renderPmlMarkdown } from "@/lib/pml/parse-pml-markdown";
import { renderMarkdownBold } from "@/lib/pml/render-markdown-bold";

import { api } from "../lib/api";
import { useCart } from "../state/cart";
import { useT } from "../state/session";
import { Dialog, Img, Loaded, Price, Stepper, useLoad, useMoney } from "./common";
import { MiniRow, StarButton } from "./products";

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
  const title = load.status === "ready" ? load.data.name : d.product;
  return (
    <Dialog title={title} onClose={onClose} wide className="product-dialog">
      <Loaded load={load} retry={reload}>
        {(product) => <ProductView product={product} />}
      </Loaded>
      <p className="raw-link">
        <a
          href={`api/desk/raw?${new URLSearchParams({ page: `product-details-page-root?id=${id}` })}`}
          download
        >
          {d.downloadRaw}
        </a>
      </p>
    </Dialog>
  );
}

function ProductView({ product }: { product: ProductDetail }) {
  const { t, d } = useT();
  const cart = useCart();
  const money = useMoney();
  const quantity = cart.quantity(product.id);
  const [picture, setPicture] = useState(0);
  const pictures = product.imageIds.length ? product.imageIds : [""];
  const hasAllergens = product.allergens.confirmed.length > 0 || product.allergens.mayContain.length > 0;
  const nutritionSection = product.nutritionRows.length
    ? product.infoSections.findIndex((s) => NUTRITION_TITLE.test(s.title))
    : -1;

  return (
    <div className="product">
      <div className="product-top">
        <div className="gallery">
          <Img id={pictures[picture]} className="gallery-main" alt={product.name} />
          {pictures.length > 1 && (
            <div className="gallery-thumbs">
              {pictures.map((imageId, index) => (
                <button
                  key={imageId + index}
                  type="button"
                  aria-pressed={index === picture}
                  aria-label={`${d.picture} ${index + 1}`}
                  onClick={() => setPicture(index)}
                >
                  <Img id={imageId} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-info">
          {product.labels.length > 0 && (
            <p className="labels">
              {product.labels.map((label, i) => (
                <span key={i} className="badge" style={{ color: label.textColor, backgroundColor: label.backgroundColor }}>
                  {label.text}
                </span>
              ))}
            </p>
          )}
          {product.brand && <p className="product-brand">{product.brand}</p>}
          <p className="product-unit">
            {product.unitQuantity}
            {product.unitPrice && <span> · {product.unitPrice}</span>}
            {product.categoryTag && (
              <span className="category-tag" style={{ color: product.categoryTag.color }}>
                {" "}
                · {product.categoryTag.text}
              </span>
            )}
          </p>

          <div className="product-buy">
            <Price cents={product.displayPrice} was={product.originalPrice} color={product.displayPriceColor} className="price-large" />
            {product.promotion && <span className="badge badge-promo">{product.promotion.label}</span>}
            <Stepper
              large
              quantity={quantity}
              maxCount={product.maxCount}
              name={product.name}
              onAdd={() => cart.add(product.id, product.maxCount)}
              onRemove={() => cart.remove(product.id)}
            />
            <StarButton
              product={{
                id: product.id,
                name: product.name,
                imageId: product.imageIds[0] ?? "",
                unitQuantity: product.unitQuantity,
                displayPrice: product.displayPrice,
              }}
            />
          </div>

          {product.bundles.length > 0 && (
            <div className="bundles">
              {product.bundles.map((bundle) => (
                <button
                  key={bundle.id}
                  type="button"
                  className={`bundle ${quantity >= bundle.quantity ? "bundle-on" : ""}`}
                  onClick={() => cart.set(product.id, Math.max(quantity, bundle.quantity), product.maxCount)}
                >
                  <strong>{bundle.quantity}×</strong> {money(bundle.pricePerUnit)} {d.each}
                </button>
              ))}
            </div>
          )}

          {product.description && (
            <section>
              <h3>{t.descriptionTitle}</h3>
              <p className="prose">{renderMarkdownBold(product.description)}</p>
            </section>
          )}

          {product.highlights.length > 0 && (
            <ul className="highlights">
              {product.highlights.map((item, i) => (
                <li key={i}>
                  {item.iconKey && <span aria-hidden="true">{HIGHLIGHT_ICONS[item.iconKey] ?? "●"}</span>}
                  <span>{renderPmlMarkdown(item.text)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {hasAllergens && (
        <section className="allergens">
          <h3>{t.allergenTitle}</h3>
          <AllergenList label={t.recipeAllergens} badges={product.allergens.confirmed} />
          <AllergenList label={t.recipeMayContain} badges={product.allergens.mayContain} />
        </section>
      )}

      {(product.infoSections.length > 0 || product.nutritionRows.length > 0) && (
        <div className="folds">
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
        </div>
      )}

      <MiniRow title={t.similarProductsTitle} products={product.similarProducts} />
    </div>
  );
}

export function AllergenList({ label, badges }: { label: string; badges: AllergenBadge[] }) {
  if (!badges.length) return null;
  return (
    <p className="allergen-row">
      <span>{label}:</span>
      {badges.map((badge, i) => (
        <span key={i} className="badge" style={{ backgroundColor: badge.backgroundColor, color: badge.textColor }}>
          {badge.text}
        </span>
      ))}
    </p>
  );
}

export function NutritionTable({ rows }: { rows: NutritionRow[] }) {
  if (!rows.length) return null;
  return (
    <table className="nutrition">
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={row.isCategory ? "" : "sub"} style={row.backgroundColor ? { backgroundColor: row.backgroundColor } : undefined}>
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
      <div className="fold-body">{children}</div>
    </details>
  );
}

/**
 * Text from a fold-out section: **bold**, line breaks, and markdown tables
 * ("| a | b |" lines), which Picnic uses for nutrition and the like.
 */
export function RichText({ text }: { text: string }) {
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
