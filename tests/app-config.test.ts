/**
 * The Home Assistant app's own files agree with each other and with the
 * guidelines (developers.home-assistant.io/docs/apps/presentation).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("../picnic_desk/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, dir), "utf8");

/** The keys directly under a top-level `section:` of a simple YAML file. */
function keysUnder(yaml: string, section: string): string[] {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => line === `${section}:`);
  assert.ok(start >= 0, `no ${section}:`);
  const keys: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const key = /^ {2}([a-z_]+):/.exec(line);
    if (key) keys.push(key[1]);
  }
  return keys.sort();
}

const config = read("config.yaml");

test("every option has a default, a schema entry and a translation in every language", () => {
  const schema = keysUnder(config, "schema");
  assert.deepEqual(keysUnder(config, "options"), schema);
  const languages = readdirSync(new URL("translations/", dir)).sort();
  assert.deepEqual(languages, ["de.yaml", "en.yaml", "fr.yaml", "nl.yaml"]);
  for (const file of languages) {
    const translation = read(`translations/${file}`);
    assert.deepEqual(keysUnder(translation, "configuration"), schema, file);
    for (const key of schema) {
      const block = translation.split(`  ${key}:\n`)[1] ?? "";
      assert.match(block, /^ {4}name: \S/m, `${file} ${key} name`);
      assert.match(block, /^ {4}description: \S/m, `${file} ${key} description`);
    }
  }
});

test("the version is the same everywhere", () => {
  const version = /^version: "([^"]+)"$/m.exec(config)?.[1];
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(version, pkg.version);
  assert.match(read("CHANGELOG.md"), new RegExp(`^## \\[?${version!.replace(/\./g, "\\.")}\\]?`, "m"), "a changelog entry");
});

test("icon and logo are PNGs of the recommended shape", () => {
  const size = (name: string) => {
    const png = readFileSync(new URL(name, dir));
    assert.equal(png.subarray(1, 4).toString("latin1"), "PNG", name);
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  const [w, h] = size("icon.png");
  assert.equal(w, h, "the icon is square");
  assert.ok(w >= 128);
  const [lw, lh] = size("logo.png");
  assert.ok(lw > lh, "the logo is wide");
});

test("the app asks Home Assistant for nothing it does not need", () => {
  for (const risky of ["host_network", "privileged", "full_access", "docker_api", "hassio_api", "homeassistant_api", "auth_api", "host_pid", "apparmor: false", "ports:"]) {
    assert.ok(!config.includes(risky), risky);
  }
  assert.match(config, /^ingress: true$/m);
  assert.match(config, /^panel_admin: true$/m);
});
