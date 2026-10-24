// Build Picnic Desk into picnic_desk/dist, the folder the Home Assistant app
// image copies. The result is committed, so installing the app needs no npm.
//
//   node scripts/build.mjs           build
//   node scripts/build.mjs --check   build to a temporary folder and fail when
//                                    it differs from what is committed
import { build } from "esbuild";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const config = readFileSync(join(root, "picnic_desk/config.yaml"), "utf8");
const version = /^version:\s*"?([^"\n]+)"?/m.exec(config)[1];
/** Where the source is: the AGPL asks that users of the app can get it. */
const source = /^url:\s*"?([^"\n]+)"?/m.exec(config)[1];
const check = process.argv.includes("--check");
const committed = join(root, "picnic_desk/dist");
const out = check ? mkdtempSync(join(tmpdir(), "desk-build-")) : committed;

const alias = {
  "@": join(root, "vendor/picnic-web/src"),
  "next/server": join(root, "src/server/next-server.ts"),
};
const common = {
  bundle: true,
  alias,
  legalComments: "none",
  logLevel: "warning",
  charset: "utf8",
  // The same input always gives the same output, so --check can compare.
  metafile: false,
};

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "public"), { recursive: true });

await build({
  ...common,
  entryPoints: [join(root, "src/server/main.ts")],
  outfile: join(out, "server.mjs"),
  platform: "node",
  format: "esm",
  target: "node22",
  define: { DESK_VERSION: JSON.stringify(version) },
  // picnic-api is CommonJS and calls require(); give the ESM bundle one.
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
});

await build({
  ...common,
  entryPoints: [join(root, "src/ui/main.tsx")],
  outfile: join(out, "public/app.js"),
  platform: "browser",
  format: "iife",
  target: ["chrome111", "firefox115", "safari16.4"],
  jsx: "automatic",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"', DESK_VERSION: JSON.stringify(version), DESK_SOURCE: JSON.stringify(source) },
});

// Licences of what the bundles contain (esbuild drops the comments that carry them).
const BUNDLED = [
  ["picnic-web (vendor/picnic-web, by MRVDH)", "vendor/picnic-web/LICENSE"],
  ["picnic-api", "node_modules/picnic-api/LICENSE"],
  ["react", "node_modules/react/LICENSE"],
  ["react-dom", "node_modules/react-dom/LICENSE"],
  ["scheduler", "node_modules/scheduler/LICENSE"],
];
writeFileSync(
  join(out, "THIRD_PARTY_LICENSES.txt"),
  [
    "Picnic Desk is licensed under the GNU Affero General Public License v3.0 (see LICENSE in its repository).",
    "It contains the following software:",
    ...BUNDLED.map(([name, file]) => `\n${"=".repeat(78)}\n${name}\n${"=".repeat(78)}\n\n${readFileSync(join(root, file), "utf8").trim()}`),
  ].join("\n") + "\n"
);

cpSync(join(root, "src/ui/index.html"), join(out, "public/index.html"));
cpSync(join(root, "src/ui/app.css"), join(out, "public/app.css"));
cpSync(join(root, "src/ui/icon.svg"), join(out, "public/icon.svg"));

if (check) {
  const list = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? list(path) : [path];
    });
  const files = (base) => list(base).map((path) => relative(base, path));
  const a = files(out).sort();
  const b = files(committed).sort();
  const differs =
    a.join() !== b.join() || a.some((file) => !readFileSync(join(out, file)).equals(readFileSync(join(committed, file))));
  rmSync(out, { recursive: true, force: true });
  if (differs) {
    console.error("picnic_desk/dist is not what the sources build: run npm run build and commit the result.");
    process.exit(1);
  }
  console.log("picnic_desk/dist matches the sources.");
} else {
  console.log(`built Picnic Desk ${version} into ${relative(root, out)}`);
}
