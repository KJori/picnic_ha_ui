// Copy the Picnic code of MRVDH/picnic-web into vendor/picnic-web.
//
//   node scripts/vendor.mjs <path to a picnic-web checkout>
//
// Copies src/lib and src/app/api unchanged, plus the licence, and records the
// commit in vendor/picnic-web/UPSTREAM. Nothing in vendor/ is edited by hand:
// to take a newer picnic-web, check it out, run this, then run the checks.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const source = process.argv[2];
if (!source || !existsSync(join(source, "src", "lib"))) {
  console.error("usage: node scripts/vendor.mjs <path to a picnic-web checkout>");
  process.exit(2);
}

const git = (...args) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const date = git("show", "-s", "--format=%cI", "HEAD");
if (git("status", "--porcelain", "--", "src/lib", "src/app/api")) {
  console.error("The checkout has local changes in src/lib or src/app/api; vendor a clean commit.");
  process.exit(1);
}

const target = resolve("vendor/picnic-web");
rmSync(target, { recursive: true, force: true });
mkdirSync(join(target, "src", "app"), { recursive: true });
cpSync(join(source, "src", "lib"), join(target, "src", "lib"), { recursive: true });
cpSync(join(source, "src", "app", "api"), join(target, "src", "app", "api"), { recursive: true });
cpSync(join(source, "LICENSE"), join(target, "LICENSE"));
writeFileSync(
  join(target, "UPSTREAM"),
  `https://github.com/MRVDH/picnic-web\ncommit ${commit}\ndate ${date}\n`
);
console.log(`vendored picnic-web ${commit.slice(0, 7)} (${date})`);
