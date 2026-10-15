/**
 * Small JSON files in the app's data folder (/data under Home Assistant,
 * which Home Assistant includes in backups).
 *
 * Writes go to a temporary file that is flushed to disk and then renamed over
 * the old one, so a crash or power cut leaves either the old or the new file,
 * never half of one.
 * Files are created readable by the app's user only.
 */
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { join } from "node:path";

export class Store {
  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  read<T>(name: string, fallback: T, check: (value: unknown) => value is T): T {
    try {
      const value: unknown = JSON.parse(readFileSync(join(this.dir, name), "utf8"));
      return check(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  write(name: string, value: unknown): void {
    const path = join(this.dir, name);
    const temporary = `${path}.${process.pid}.tmp`;
    const fd = openSync(temporary, "w", 0o600);
    try {
      writeSync(fd, JSON.stringify(value, null, 1));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
  }

  remove(name: string): void {
    rmSync(join(this.dir, name), { force: true });
  }
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
