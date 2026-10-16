/**
 * Price per kilo, litre or piece, worked out from the pack size Picnic writes
 * under a product ("500 gram", "6 x 330 ml", "4 Stück").
 *
 * Only plain sizes are read: one amount with a known unit, possibly as a
 * multipack, possibly "ca." for weighed products. Anything else ("300 g,
 * uitlekgewicht 180 g", "per bos", "3 bollen") gives nothing: no price per
 * kilo is better than a wrong one.
 */

export type Per = "kg" | "l" | "piece";
export type UnitPrice = { cents: number; per: Per };

/** Grams per unit. */
const MASS: Record<string, number> = { mg: 0.001, g: 1, gr: 1, gram: 1, grams: 1, gramm: 1, kg: 1000, kilo: 1000, kilogram: 1000 };
/** Millilitres per unit. */
const VOLUME: Record<string, number> = { ml: 1, cl: 10, dl: 100, l: 1000, ltr: 1000, liter: 1000, litre: 1000, liters: 1000, litres: 1000 };
const PIECES = new Set(["stuk", "stuks", "st", "stück", "stueck", "pièce", "pièces", "piece", "pieces", "pc", "pcs"]);

/** "ca. 1 kg", "± 500 g", "env. 1 kg", "ca. 1 kg" are weighed: the price is per that amount all the same. */
const ABOUT = /^(?:ca\.?|circa|±|env\.?|environ|ungefähr|etwa)\s*/;
const SIZE = /^(?:(\d{1,3})\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*([a-zäöüéèû]+)\.?$/;

/** A number as Picnic writes it: "1,5" and "1.5" are one and a half, "1.000" is a thousand. */
function amount(text: string): number {
  if (/^\d{1,3}\.\d{3}$/.test(text)) return Number(text.replace(".", ""));
  return Number(text.replace(",", "."));
}

/** The pack size in grams, millilitres or pieces; null when it is not a plain size. */
export function packSize(unitQuantity: string | null | undefined): { amount: number; per: Per } | null {
  if (!unitQuantity) return null;
  const text = unitQuantity.trim().toLowerCase().replace(ABOUT, "");
  const match = SIZE.exec(text);
  if (!match) return null;
  const packs = match[1] ? Number(match[1]) : 1;
  const each = amount(match[2]);
  const unit = match[3];
  if (!(packs >= 1) || !(each > 0)) return null;
  if (unit in MASS) return { amount: packs * each * MASS[unit], per: "kg" };
  if (unit in VOLUME) return { amount: packs * each * VOLUME[unit], per: "l" };
  // A price per piece only says something for more than one.
  if (PIECES.has(unit) && packs * each > 1 && Number.isInteger(packs * each)) return { amount: packs * each, per: "piece" };
  return null;
}

/** The price per kilo, litre or piece in cents; null when the size cannot be read. */
export function unitPrice(cents: number, unitQuantity: string | null | undefined): UnitPrice | null {
  const size = packSize(unitQuantity);
  if (!size || !(cents > 0)) return null;
  const per = size.per === "piece" ? cents / size.amount : (cents / size.amount) * 1000;
  // A pack under a gram or over 100 kilos is a misreading, not a product.
  if (size.per !== "piece" && (size.amount < 1 || size.amount > 100_000)) return null;
  return Number.isFinite(per) ? { cents: Math.round(per), per: size.per } : null;
}

// ─── Ordering results ────────────────────────────────────────────────────────

export type SortOrder = "picnic" | "price" | "unit";
type Priced = { displayPrice: number; unitQuantity: string; isUnavailable?: boolean };

/**
 * Picnic's order, cheapest first, or cheapest per kilo or litre first.
 * By kilo or litre, products sold per piece come after those, and products
 * whose size cannot be read after all; sold-out products always go last.
 */
export function sortProducts<T extends Priced>(products: T[], order: SortOrder): T[] {
  if (order === "picnic") return products;
  const rank = (p: T): [number, number] => {
    if (p.isUnavailable || !(p.displayPrice > 0)) return [9, 0];
    if (order === "price") return [0, p.displayPrice];
    const per = unitPrice(p.displayPrice, p.unitQuantity);
    if (!per) return [2, p.displayPrice];
    return [per.per === "piece" ? 1 : 0, per.cents];
  };
  // Sorting a copy keeps Picnic's order among equals (Array.prototype.sort is stable).
  return [...products].sort((a, b) => {
    const [ga, va] = rank(a);
    const [gb, vb] = rank(b);
    return ga - gb || va - vb;
  });
}
