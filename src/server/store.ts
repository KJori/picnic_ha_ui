/**
 * Small JSON files in the app's data folder (/data under Home Assistant,
 * which Home Assistant includes in backups).
 *
 * Writes go to a temporary file that is flushed to disk and then renamed over
 * the old one, so a crash or power cut leaves either the old or the new file,
 * never half of one.
 * Files are created readable by the app's user only.
 *
 * Caches that change often (recipe prices) are written with `writeSoon`: at
 * most every few seconds, the latest value only, without waiting for the
 * disk. Writing the whole file and waiting for the disk on every change held
 * up every other request while the file grew.
 */
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { join } from "node:path";

const SOON_MS = 3000;

export class Store {
  readonly #soon = new Map<string, unknown>();
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  #readFile<T>(name: string, fallback: T, check: (value: unknown) => value is T): T {
    try {
      const value: unknown = JSON.parse(readFileSync(join(this.dir, name), "utf8"));
      return check(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  read<T>(name: string, fallback: T, check: (value: unknown) => value is T): T {
    if (this.#soon.has(name)) {
      const value = this.#soon.get(name);
      return check(value) ? (value as T) : fallback;
    }
    return this.#readFile(name, fallback, check);
  }

  write(name: string, value: unknown, { durable = true }: { durable?: boolean } = {}): void {
    this.#soon.delete(name); // this newer value wins over one waiting
    const path = join(this.dir, name);
    const temporary = `${path}.${process.pid}.tmp`;
    const fd = openSync(temporary, "w", 0o600);
    try {
      writeSync(fd, durable ? JSON.stringify(value, null, 1) : JSON.stringify(value));
      if (durable) fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
  }

  /** Write a cache a little later; several changes in a row become one write. */
  writeSoon(name: string, value: unknown): void {
    this.#soon.set(name, value);
    if (this.#timer) return;
    this.#timer = setTimeout(() => this.flush(), SOON_MS);
    this.#timer.unref(); // waiting writes do not keep the app running; stopping flushes them
  }

  /** Write what is waiting now (when stopping). */
  flush(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    const waiting = [...this.#soon];
    this.#soon.clear();
    for (const [name, value] of waiting) {
      try {
        this.write(name, value, { durable: false });
      } catch (error) {
        console.error(`[store] cannot write ${name}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  remove(name: string): void {
    this.#soon.delete(name);
    rmSync(join(this.dir, name), { force: true });
  }
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
