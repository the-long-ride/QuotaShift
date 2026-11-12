import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("v1.2.2 package, Tauri and Cargo metadata all agree", () => {
  const pkg = JSON.parse(read("package.json"));
  const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
  const cargo = read("src-tauri/Cargo.toml");
  const lock = read("src-tauri/Cargo.lock");
  assert.equal(pkg.version, "1.2.2");
  assert.equal(tauri.version, pkg.version);
  assert.match(cargo, /\[package\]\s*name = "quotashift"\s*version = "1\.2\.2"/);
  assert.match(lock, /name = "quotashift"\s*version = "1\.2\.2"/);
  assert.match(read("CHANGELOG.md"), /## \[1\.2\.2\] - 2026-11-12/);
});

test("reauthentication retains stable id, refresh token, saved account order", () => {
  const modal = read("src/components/antigravity/modal/AddAntigravityAccountModal.tsx");
  assert.match(modal, /id: resolvedIdx !== -1 \? accounts\[resolvedIdx\]\.id/);
  assert.match(modal, /accounts\[resolvedIdx\]\?\.refreshToken/);
  assert.match(modal, /saveAccounts\(sortByOrder\(accounts, loadAccountOrder\(ANTIGRAVITY_ORDER_KEY\)\)\)/);
});

test("native restart return value is not mistaken for a nonexistent success field", () => {
  const ag = read("src/hooks/antigravity/useAntigravityAccountOps.ts");
  const native = read("src-tauri/src/system/session.rs");
  assert.doesNotMatch(ag, /switchResult\.success/);
  assert.match(native, /pub struct AntigravitySwitchResult/);
  assert.match(native, /verify_antigravity_restarted/);
});
