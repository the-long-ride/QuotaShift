import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PATCH_REV = "9e2bb20e2daba5b4dc5e2c9f4dee0797a1503b9f";
const PATCH_REPO = "https://github.com/andrew-wommack-ministries/glib-rustsec-2024-0429-backport";

const cargoToml = readFileSync(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const auditToml = readFileSync(new URL("../src-tauri/.cargo/audit.toml", import.meta.url), "utf8");
const dependabot = readFileSync(new URL("../.github/dependabot.yml", import.meta.url), "utf8");
const securityPolicy = readFileSync(new URL("../SECURITY.md", import.meta.url), "utf8");

test("RUSTSEC-2024-0429 uses the reviewed glib 0.18.5 backport", () => {
  assert.match(cargoToml, /\[patch\.crates-io\]/);
  assert.ok(
    cargoToml.includes(`glib = { git = "${PATCH_REPO}", rev = "${PATCH_REV}" }`),
    "Cargo.toml must pin the reviewed glib backport by immutable commit SHA",
  );

  assert.ok(
    auditToml.includes(PATCH_REV),
    "the audit exception must document the exact patched source used by Cargo",
  );
  assert.match(
    auditToml,
    /version-based scanner/i,
    "the remaining advisory ignore must be documented as scanner metadata, not runtime mitigation",
  );
});

test("Dependabot and security policy keep the glib exception narrow and removable", () => {
  assert.match(dependabot, /dependency-name:\s*"glib"/);
  assert.match(dependabot, /versions:\s*\[">=0\.15\.0, <0\.20\.0"\]/);
  assert.ok(
    dependabot.includes(PATCH_REV),
    "Dependabot rationale must point at the exact source-patched revision",
  );
  assert.match(dependabot, /Remove it when a stable Tauri graph accepts glib >=0\.20/);

  assert.match(securityPolicy, /GHSA-wrw7-89jp-8q8g \/ RUSTSEC-2024-0429/);
  assert.ok(
    securityPolicy.includes(PATCH_REV),
    "SECURITY.md must record the exact reviewed backport revision",
  );
  assert.match(securityPolicy, /stable.*Tauri[\s\S]*glib >=0\.20\.0/i);
  assert.match(securityPolicy, /Any different `glib` advisory[\s\S]*triaged independently/);
});
