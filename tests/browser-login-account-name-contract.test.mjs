import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const codexModal = fs.readFileSync("src/components/codex/AddAccountModal.tsx", "utf8");
const codexBrowser = fs.readFileSync("src/components/codex/CodexBrowserLoginTab.tsx", "utf8");
const antigravityModal = fs.readFileSync(
  "src/components/antigravity/AddAntigravityAccountModal.tsx",
  "utf8",
);
const antigravityBrowser = fs.readFileSync(
  "src/components/antigravity/AntigravityOAuthStepView.tsx",
  "utf8",
);

test("Codex browser login derives the account label from authenticated profile data", () => {
  assert.doesNotMatch(
    codexBrowser,
    /Account Label Prefix|oauthLabel|setOauthLabel|browserLabelRef/,
    "browser login must not ask for an account alias",
  );
  assert.match(codexModal, /profile\?\.name/, "Codex must prefer the authenticated profile name");
  assert.match(
    codexModal,
    /email[^\n]*split\(["']@["']\)/,
    "Codex must fall back to the part before @ in the authenticated email",
  );
  assert.match(codexModal, /\|\|\s*["']ChatGPT["']/, "Codex needs a provider fallback label");
  assert.match(
    codexModal,
    /existingAccount\?\.label/,
    "reconnecting an existing Codex account must preserve its current label",
  );
});

test("Antigravity browser login derives the account label from Google profile data", () => {
  assert.doesNotMatch(
    antigravityBrowser,
    /Account Label|oauthLabel|setOauthLabel|browserLabelRef/,
    "browser login must not ask for an account alias",
  );
  assert.match(
    antigravityModal,
    /userInfo\.name|tokenJson\.name/,
    "Antigravity must capture the authenticated Google display name",
  );
  assert.match(
    antigravityModal,
    /email[^\n]*split\(["']@["']\)/,
    "Antigravity must fall back to the part before @ in the authenticated email",
  );
  assert.match(
    antigravityModal,
    /\|\|\s*["']Antigravity["']/,
    "Antigravity needs a provider fallback label",
  );
  assert.match(
    antigravityModal,
    /accounts\[existingIdx\]\.label/,
    "reconnecting an existing Antigravity account must preserve its current label",
  );
});
