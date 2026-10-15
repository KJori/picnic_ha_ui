/**
 * Start Picnic Desk.
 *
 * Settings come from the environment, and the country from the app's options
 * in Home Assistant (/data/options.json):
 *
 *   PORT          8099
 *   DATA_DIR      /data under Home Assistant, ./data otherwise
 *   INGRESS_ONLY  "1": only Home Assistant's ingress gateway may connect
 *   COUNTRY_CODE  NL, DE or FR; overrides the app option
 *   DESK_LANGUAGE en, nl, de or fr; overrides the app option
 *   PICTURE_CACHE_MB  size limit of the picture folder; overrides the app option
 *   PICNIC_DEMO   "1": a built-in demo shop instead of Picnic
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Desk } from "./app";
import { installFetchTimeout, installOnlyPicnic } from "./fetch-timeout";
import { LANGUAGES, type Language } from "./desk-routes";
import { demoShop } from "./demo/shop";
import { DEFAULT_CACHE_MB } from "./pictures";
import { VENDORED_ROUTES } from "./routes.generated";
import { isCountry } from "./session";

declare const DESK_VERSION: string;

const SHUTDOWN_GRACE_MS = 5000;

function appOptions(dataDir: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(dataDir, "options.json"), "utf8"));
  } catch {
    return {};
  }
}

export function startDesk(env: NodeJS.ProcessEnv = process.env) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = env.DATA_DIR || "./data";
  const options = appOptions(dataDir);
  const optionCountry = options.country_code;
  const wanted = (env.COUNTRY_CODE || (typeof optionCountry === "string" ? optionCountry : "") || "NL").toUpperCase();
  const country = isCountry(wanted) ? wanted : "NL";
  const demo = env.PICNIC_DEMO === "1";
  const wantedLanguage = String(env.DESK_LANGUAGE || options.language || "en").toLowerCase();
  const language = (LANGUAGES as readonly string[]).includes(wantedLanguage) ? (wantedLanguage as Language) : "en";

  const allowedUsers = Array.isArray(options.allowed_users)
    ? options.allowed_users.filter((name): name is string => typeof name === "string" && name.trim() !== "")
    : [];
  const wantedCache = Number(env.PICTURE_CACHE_MB || options.picture_cache_mb || DEFAULT_CACHE_MB);
  const pictureCacheMb = Number.isFinite(wantedCache) && wantedCache >= 0 ? wantedCache : DEFAULT_CACHE_MB;

  installOnlyPicnic();
  installFetchTimeout();
  // An app that runs for months logs a stray failure instead of stopping on it.
  process.on("unhandledRejection", (reason) => {
    console.error("[desk] unhandled:", reason instanceof Error ? reason.stack : reason);
  });
  const desk = new Desk({
    dataDir,
    publicDir: env.PUBLIC_DIR || join(here, "public"),
    country,
    language,
    pictureCacheMb,
    allowedUsers,
    ingressOnly: env.INGRESS_ONLY === "1",
    version: typeof DESK_VERSION === "string" ? DESK_VERSION : "dev",
    routes: VENDORED_ROUTES,
    demo: demo ? demoShop() : undefined,
  });

  const server = createServer(desk.handle);
  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  const port = Number(env.PORT || 8099);
  server.listen(port, () => {
    console.log(
      `Picnic Desk ${desk.options.version} on port ${port} (${country}${demo ? ", demo shop" : ""}` +
        `${desk.options.ingressOnly ? ", ingress only" : ""})`
    );
  });
  // Home Assistant stops an app with SIGTERM and waits a little before killing
  // it. Finish what is running, close idle connections, and do not wait for
  // a slow request longer than that.
  const stop = () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => {
      server.closeAllConnections();
      process.exit(0);
    }, SHUTDOWN_GRACE_MS).unref();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return { server, desk };
}

startDesk();
