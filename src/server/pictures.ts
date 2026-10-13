/**
 * Pictures from Picnic, for when the page's direct load fails.
 *
 * The page loads a picture straight from Picnic's image server, the way
 * picnic-web does: <id>/medium.png for products and <id>/filled-600x600.webp
 * for recipes. Which variants exist differs per picture and nobody has written
 * the rules down, so when that load fails the page asks here, and this tries
 * the other variants the open-source clients use, remembers what worked, and
 * keeps the failures for the self-check.
 *
 * Variants: medium.png (picnic-web, MRVDH/picnic-api), filled-600x600.webp
 * (picnic-web, for recipes), padded.webp (search tiles' own image config, seen
 * in python-picnic-api2's samples), small/large/regular.png and
 * tile-medium.webp (python-picnic-api2), large.png (mcp-picnic, for recipes).
 */
import { getImageCdnBase, type CountryCode } from "@/lib/core/types";

export const IMAGE_ID = /^(?:[a-z][a-z0-9_-]{1,30}\/)?[A-Za-z0-9_-]{8,128}$/;

export const PRODUCT_VARIANTS = ["medium.png", "padded.webp", "small.png", "large.png", "tile-medium.webp", "regular.png"];
export const RECIPE_VARIANTS = ["filled-600x600.webp", "large.png", "medium.png", "padded.webp"];

const CACHE_ITEMS = 400;
const MISSING_FOR_MS = 10 * 60 * 1000;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export type Picture = { data: Buffer; type: string; variant: string };
export type Attempt = { variant: string; outcome: string | number };

export function pictureType(data: Buffer): string | null {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP")
    return "image/webp";
  const brand = data.subarray(4, 12).toString("latin1");
  if (brand === "ftypavif" || brand === "ftypavis") return "image/avif";
  const head = data.subarray(0, 6).toString("latin1");
  if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  return null; // SVG and everything else is refused: it could carry script
}

export class Pictures {
  readonly #cache = new Map<string, Picture>();
  readonly #missing = new Map<string, number>();
  readonly worked = new Map<string, number>();
  readonly failures: { id: string; tried: Attempt[] }[] = [];

  constructor(
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly now: () => number = Date.now,
    private readonly pause: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  ) {}

  variants(kind: "product" | "recipe"): string[] {
    const base = kind === "recipe" ? RECIPE_VARIANTS : PRODUCT_VARIANTS;
    // What has worked most often this session first; ties keep the documented order.
    return [...base].sort((a, b) => (this.worked.get(b) ?? 0) - (this.worked.get(a) ?? 0));
  }

  async load(id: string, kind: "product" | "recipe", country: CountryCode, fresh = false) {
    const tried: Attempt[] = [];
    if (!IMAGE_ID.test(id)) return { picture: null, tried };
    const key = `${country}:${id}`;
    const cached = this.#cache.get(key);
    if (cached && !fresh) {
      this.#cache.delete(key);
      this.#cache.set(key, cached);
      return { picture: cached, tried };
    }
    if (!fresh && (this.#missing.get(key) ?? 0) > this.now()) return { picture: null, tried };

    for (const variant of this.variants(kind)) {
      const outcome = await this.#fetch(`${getImageCdnBase(country)}/${id}/${variant}`);
      tried.push({ variant, outcome: typeof outcome === "object" ? 200 : outcome });
      if (typeof outcome !== "object") continue;
      const picture = { ...outcome, variant };
      this.worked.set(variant, (this.worked.get(variant) ?? 0) + 1);
      this.#missing.delete(key);
      this.#cache.set(key, picture);
      while (this.#cache.size > CACHE_ITEMS) this.#cache.delete(this.#cache.keys().next().value!);
      return { picture, tried };
    }

    this.#missing.set(key, this.now() + MISSING_FOR_MS);
    if (this.#missing.size > 5000) this.#missing.clear();
    this.failures.push({ id, tried });
    if (this.failures.length > 40) this.failures.shift();
    return { picture: null, tried };
  }

  async #fetch(url: string): Promise<{ data: Buffer; type: string } | string | number> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { headers: { "User-Agent": "okhttp/4.9.0" } });
      } catch (error) {
        return error instanceof Error ? error.name : "network";
      }
      if (response.ok) {
        const data = Buffer.from(await response.arrayBuffer());
        if (data.length === 0) return "empty";
        const type = pictureType(data);
        return type ? { data, type } : "not a picture";
      }
      // Let go of the body without waiting: cancelling a teed stream settles only when every branch is cancelled.
      response.body?.cancel().catch(() => undefined);
      if (attempt === 1 && RETRY_STATUSES.has(response.status)) {
        await this.pause(600);
        continue;
      }
      return response.status;
    }
    return "no answer";
  }

  forget(): void {
    this.#cache.clear();
    this.#missing.clear();
  }
}
