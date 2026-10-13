/**
 * Loaded before every test file (see "test" in package.json).
 *
 * picnic-web loads picnic-api with require(), which ES modules do not have;
 * the build gives the bundle one (scripts/build.mjs) and this gives the tests one.
 */
import { createRequire } from "node:module";

(globalThis as { require?: NodeRequire }).require ??= createRequire(new URL("../package.json", import.meta.url));
