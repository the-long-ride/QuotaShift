import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readWithCssImports } from "./css-helper.mjs";
import { decodeJwtEmail, decodeJwtProfile } from "../.test-build/auth/auth.js";

const read = (path) => readWithCssImports(path);
const app = read("src/App.tsx");
const addAntigravity = read("src/components/antigravity/AddAntigravityAccountModal.tsx");
const oauth = fs.readFileSync("src-tauri/src/auth/oauth.rs", "utf8");

test("App wires setAntigravityAccounts and freshly loads target in AddAntigravityAccountModal", () => {
  const modalStart = app.indexOf("<AddAntigravityAccountModal");
  const modalEnd = app.indexOf("/>", modalStart);
  assert.ok(modalStart >= 0 && modalEnd > modalStart, "AddAntigravityAccountModal must be rendered in App.tsx");
  const modalSlice = app.slice(modalStart, modalEnd);

  assert.match(
    modalSlice,
    /saveAccounts=\{\(accs\)\s*=>\s*\{\s*saveAntigravityAccounts\(accs\);\s*setAntigravityAccounts\(accs\);\s*\}\}/,
    "saveAccounts must update both persistent storage and App React state",
  );
  assert.match(
    modalSlice,
    /loadAntigravityAccounts\(\)\.find\(/,
    "onAccountAdded must resolve target account from fresh storage",
  );
});

test("AddAntigravityAccountModal does not re-register listener or cancel session on label typing", () => {
  assert.match(
    addAntigravity,
    /oauthLabelRef\.current\s*=\s*oauthLabel/,
    "oauthLabel must be synchronized via ref",
  );
  assert.match(
    addAntigravity,
    /\},\s*\[isOpen\]\);/,
    "OAuth callback listener useEffect must only depend on isOpen",
  );
});

test("decodeJwtProfile handles unpadded base64url tokens without throwing", () => {
  const syntheticToken = "header.eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJwaWN0dXJlIjoiaHR0cHM6Ly9waWMudGVzdC9tZS5wbmcifQ.sig";
  const profile = decodeJwtProfile(syntheticToken);
  assert.equal(profile?.email, "test@example.com");
  assert.equal(profile?.picture, "https://pic.test/me.png");

  const email = decodeJwtEmail(syntheticToken);
  assert.equal(email, "test@example.com");
});

test("Rust OAuth listener uses accept loop, ignores favicon requests, and retries port binding", () => {
  assert.match(
    oauth,
    /for\s+attempt\s+in\s+0\.\.5/,
    "start_antigravity_google_oauth must retry binding to redirect port",
  );
  assert.match(
    oauth,
    /request\.starts_with\("GET \/favicon\.ico"\)/,
    "OAuth listener must ignore favicon requests instead of treating them as callback",
  );
  assert.match(
    oauth,
    /https:\/\/www\.googleapis\.com\/oauth2\/v3\/userinfo/,
    "exchange_antigravity_google_token must fetch Google user info from backend",
  );
});
