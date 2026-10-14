/**
 * Picnic's pictures, kept on disk.
 *
 * The page asks only this server for pictures. A picture is fetched from
 * Picnic's image server the first time it is needed, stored in the app's data
 * folder, and served from there from then on, so a picture once seen keeps
 * showing when Picnic's image server is slow or down, and each one crosses the
 * internet once for the whole household. A stored picture is not checked
 * again: Picnic's picture ids look like hashes of the picture, so a new photo
 * should come with a new id.
 *
 * The folder has a size limit: when it is full, the pictures used longest ago
 * go first. Home Assistant leaves it out of backups (see config.yaml).
 *
 * Which variants exist differs per picture and nobody has written the rules
 * down, so this tries the variants the open-source clients use, in order, and
 * remembers what worked. Variants: medium.png (picnic-web, MRVDH/picnic-api),
 * filled-600x600.webp (picnic-web, for recipes), padded.webp (search tiles'
 * own image config, seen in python-picnic-api2's samples), small/large/
 * regular.png and tile-medium.webp (python-picnic-api2), large.png
 * (mcp-picnic, for recipes).
 */
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { readFile, rename, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getImageCdnBase, type CountryCode } from "@/lib/core/types";

export const IMAGE_ID = /^(?:[a-z][a-z0-9_-]{1,30}\/)?[A-Za-z0-9_-]{8,128}$/;

export const PRODUCT_VARIANTS = ["medium.png", "padded.webp", "small.png", "large.png", "tile-medium.webp", "regular.png"];
export const RECIPE_VARIANTS = ["filled-600x600.webp", "large.png", "medium.png", "padded.webp"];

export const DEFAULT_CACHE_MB = 500;
const MISSING_FOR_MS = 10 * 60 * 1000;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
/** At most this many pictures are fetched from Picnic at the same time. */
const AT_ONCE = 6;
/** When full, make room down to this share of the limit, so that not every new picture evicts one. */
const AFTER_EVICTION = 0.9;
/** How often a picture's "last used" time is written to disk; in memory it is always current. */
const TOUCH_EVERY_MS = 60 * 60 * 1000;

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
};
const EXTENSIONS = Object.fromEntries(Object.entries(TYPES).map(([ext, type]) => [type, ext]));

export type Picture = { data: Buffer; type: string; variant: string };
export type Attempt = { variant: string; outcome: string | number };
type Entry = { file: string; size: number; used: number; touched: number };

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

export type PicturesOptions = {
  /** The folder pictures are kept in; without one they are fetched every time. */
  dir?: string;
  maxBytes?: number;
  fetch?: typeof fetch;
  now?: () => number;
  pause?: (ms: number) => Promise<void>;
};

export class Pictures {
  readonly #dir: string | null;
  readonly #maxBytes: number;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #pause: (ms: number) => Promise<void>;
  /** What is on disk, by key; Map order is not relied on, `used` is. */
  readonly #entries = new Map<string, Entry>();
  #bytes = 0;
  readonly #missing = new Map<string, number>();
  readonly #loading = new Map<string, Promise<{ picture: Picture | null; tried: Attempt[] }>>();
  #running = 0;
  readonly #queue: (() => void)[] = [];
  #writeTrouble = false;
  readonly worked = new Map<string, number>();
  readonly failures: { id: string; tried: Attempt[] }[] = [];

  constructor(options: PicturesOptions = {}) {
    this.#fetch = options.fetch ?? ((...args) => fetch(...args));
    this.#now = options.now ?? Date.now;
    this.#pause = options.pause ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.#maxBytes = options.maxBytes ?? DEFAULT_CACHE_MB * 1024 * 1024;
    this.#dir = options.dir ?? null;
    if (this.#dir) this.#scan(this.#dir);
  }

  /** How much is kept: for the self-check. */
  get stored(): { count: number; bytes: number; maxBytes: number; enabled: boolean } {
    return { count: this.#entries.size, bytes: this.#bytes, maxBytes: this.#maxBytes, enabled: this.#dir !== null };
  }

  variants(kind: "product" | "recipe"): string[] {
    const base = kind === "recipe" ? RECIPE_VARIANTS : PRODUCT_VARIANTS;
    // What has worked most often first; ties keep the documented order.
    return [...base].sort((a, b) => (this.worked.get(b) ?? 0) - (this.worked.get(a) ?? 0));
  }

  /**
   * The picture from disk, or from Picnic when it is not there yet. `fresh`
   * asks Picnic even so (the self-check uses it to test Picnic itself).
   */
  async load(
    id: string,
    kind: "product" | "recipe",
    country: CountryCode,
    fresh = false
  ): Promise<{ picture: Picture | null; tried: Attempt[]; from?: "disk" | "picnic" }> {
    if (!IMAGE_ID.test(id)) return { picture: null, tried: [] };
    const key = `${country}/${kind}/${encodeURIComponent(id)}`;
    if (!fresh) {
      const kept = await this.#read(key);
      if (kept) return { picture: kept, tried: [], from: "disk" };
      if ((this.#missing.get(key) ?? 0) > this.#now()) return { picture: null, tried: [] };
    }
    // Several cells showing the same product ask once.
    const running = this.#loading.get(key);
    if (running) return running;
    const loading = this.#limit(() => this.#fromPicnic(key, id, kind, country)).finally(() => this.#loading.delete(key));
    this.#loading.set(key, loading);
    return loading;
  }

  /** Forget which pictures were missing, so they are asked again. Kept pictures stay. */
  forget(): void {
    this.#missing.clear();
  }

  // ─── Picnic ────────────────────────────────────────────────────────────────

  async #fromPicnic(key: string, id: string, kind: "product" | "recipe", country: CountryCode) {
    const tried: Attempt[] = [];
    for (const variant of this.variants(kind)) {
      const outcome = await this.#get(`${getImageCdnBase(country)}/${id}/${variant}`);
      tried.push({ variant, outcome: typeof outcome === "object" ? 200 : outcome });
      if (typeof outcome !== "object") continue;
      this.worked.set(variant, (this.worked.get(variant) ?? 0) + 1);
      this.#missing.delete(key);
      await this.#write(key, outcome.data, outcome.type);
      return { picture: { ...outcome, variant }, tried, from: "picnic" as const };
    }
    this.#missing.set(key, this.#now() + MISSING_FOR_MS);
    if (this.#missing.size > 5000) this.#missing.clear();
    this.failures.push({ id, tried });
    if (this.failures.length > 40) this.failures.shift();
    return { picture: null, tried };
  }

  async #get(url: string): Promise<{ data: Buffer; type: string } | string | number> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let response: Response;
      try {
        response = await this.#fetch(url, { headers: { "User-Agent": "okhttp/4.9.0" } });
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
        await this.#pause(600);
        continue;
      }
      return response.status;
    }
    return "no answer";
  }

  /** A shelf of 60 new products should not become 60 requests to Picnic at once. */
  async #limit<T>(job: () => Promise<T>): Promise<T> {
    if (this.#running >= AT_ONCE) await new Promise<void>((resolve) => this.#queue.push(resolve));
    this.#running++;
    try {
      return await job();
    } finally {
      this.#running--;
      this.#queue.shift()?.();
    }
  }

  // ─── Disk ──────────────────────────────────────────────────────────────────

  /** What is already in the folder, from an earlier run. */
  #scan(dir: string): void {
    try {
      mkdirSync(dir, { recursive: true });
      for (const country of readdirSync(dir)) {
        if (!/^[A-Z]{2}$/.test(country)) continue;
        for (const kind of ["product", "recipe"]) {
          let names: string[];
          try {
            names = readdirSync(join(dir, country, kind));
          } catch {
            continue;
          }
          for (const name of names) {
            const match = /^(.+)\.([a-z]+)$/.exec(name);
            const file = join(dir, country, kind, name);
            if (!match || !TYPES[match[2]]) {
              // A write that was cut off ("….tmp") or something else that does not belong here.
              void rm(file, { force: true }).catch(() => undefined);
              continue;
            }
            const key = `${country}/${kind}/${match[1]}`;
            const stat = statSync(file);
            const used = stat.mtimeMs;
            const twin = this.#entries.get(key);
            if (twin) {
              // The same picture under two extensions: keep one.
              this.#drop(key);
              void rm(twin.file, { force: true }).catch(() => undefined);
            }
            this.#entries.set(key, { file, size: stat.size, used, touched: used });
            this.#bytes += stat.size;
          }
        }
      }
    } catch (error) {
      console.error("[pictures] cannot use the picture folder:", error instanceof Error ? error.message : error);
    }
    void this.#evict();
  }

  async #read(key: string): Promise<Picture | null> {
    const entry = this.#entries.get(key);
    if (!entry) return null;
    let data: Buffer;
    try {
      data = await readFile(entry.file);
    } catch {
      this.#drop(key); // removed from outside: fetch it again
      return null;
    }
    const type = pictureType(data);
    if (!type) {
      this.#drop(key);
      void rm(entry.file, { force: true }).catch(() => undefined);
      return null;
    }
    const now = this.#now();
    entry.used = now;
    if (now - entry.touched > TOUCH_EVERY_MS) {
      entry.touched = now;
      void utimes(entry.file, new Date(now), new Date(now)).catch(() => undefined);
    }
    return { data, type, variant: "kept" };
  }

  async #write(key: string, data: Buffer, type: string): Promise<void> {
    if (!this.#dir || data.length > this.#maxBytes) return;
    const ext = EXTENSIONS[type];
    const [country, kind, name] = key.split("/");
    const folder = join(this.#dir, country, kind);
    const file = join(folder, `${name}.${ext}`);
    const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      mkdirSync(folder, { recursive: true });
      await writeFile(temporary, data);
      await rename(temporary, file); // whole or not at all
      const old = this.#entries.get(key);
      if (old) {
        this.#bytes -= old.size;
        if (old.file !== file) void rm(old.file, { force: true }).catch(() => undefined);
      }
      const now = this.#now();
      this.#entries.set(key, { file, size: data.length, used: now, touched: now });
      this.#bytes += data.length;
      this.#writeTrouble = false;
    } catch (error) {
      void rm(temporary, { force: true }).catch(() => undefined);
      // A full disk should not fill the log: say it once until a write works again.
      if (!this.#writeTrouble) console.error("[pictures] cannot keep a picture:", error instanceof Error ? error.message : error);
      this.#writeTrouble = true;
      return;
    }
    await this.#evict();
  }

  #drop(key: string): void {
    const entry = this.#entries.get(key);
    if (!entry) return;
    this.#entries.delete(key);
    this.#bytes -= entry.size;
  }

  async #evict(): Promise<void> {
    if (this.#bytes <= this.#maxBytes) return;
    const oldestFirst = [...this.#entries].sort((a, b) => a[1].used - b[1].used);
    for (const [key, entry] of oldestFirst) {
      if (this.#bytes <= this.#maxBytes * AFTER_EVICTION) break;
      this.#drop(key);
      await rm(entry.file, { force: true }).catch(() => undefined);
    }
  }
}
