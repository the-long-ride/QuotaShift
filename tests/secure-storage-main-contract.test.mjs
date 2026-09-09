import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../src/utils/secure-storage.ts", import.meta.url), "utf8");

test("main hydrates secure storage before rendering the account app", () => {
  assert.match(main, /new SecureStorageAdapter\(/);
  assert.match(main, /await adapter\.hydrate\(decryptedSensitiveValues\)/);
  assert.match(main, /installSecureStorageFacade\(adapter, window\)/);
  const boot = main.slice(main.indexOf("const bootApp"));
  assert.ok(boot.indexOf("await adapter.hydrate") < boot.indexOf("root.render"));
});

test("main does not overwrite native Storage methods with plaintext store persistence", () => {
  assert.doesNotMatch(main, /localStorage\.setItem\s*=/);
  assert.doesNotMatch(main, /localStorage\.removeItem\s*=/);
  assert.match(adapter, /Object\.defineProperty\(target, "localStorage"/);
  assert.match(adapter, /isSensitiveStorageKey/);
});

test("overlay remains independent and receives only its display payload", () => {
  const overlayBranch = main.slice(main.indexOf("const isOverlay"), main.indexOf("let store"));
  assert.match(overlayBranch, /<OverlayApp\s*\/>/);
  assert.doesNotMatch(overlayBranch, /store\.json|SecureStorageAdapter|hydrate/);
});
