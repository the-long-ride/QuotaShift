import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  accountErrorText,
  isAccountReauthenticationError,
} from "../../.test-build/account/account-auth-error.js";

test("account auth errors recognize 401, 403, refresh failures, and invalid client ID", () => {
  assert.equal(
    isAccountReauthenticationError("Failed to fetch ChatGPT usage (401 Unauthorized)"),
    true,
  );
  assert.equal(isAccountReauthenticationError("HTTP 403 Forbidden"), true);
  assert.equal(
    isAccountReauthenticationError({
      code: "ANTIGRAVITY_REAUTH_REQUIRED",
      message: "Token refresh failed",
    }),
    true,
  );
  assert.equal(
    isAccountReauthenticationError(
      '400 Bad Request: {"error_description":"Could not determine client ID from request."}',
    ),
    true,
  );
  assert.equal(isAccountReauthenticationError("Invalid API key. Please check your key."), true);
  assert.equal(isAccountReauthenticationError("Network timeout"), false);
});

test("accountErrorText preserves structured Tauri auth error details", () => {
  assert.equal(
    accountErrorText({
      code: "ANTIGRAVITY_REAUTH_REQUIRED",
      message: "No refresh token available",
    }),
    "ANTIGRAVITY_REAUTH_REQUIRED: No refresh token available",
  );
});

test("account cards use the shared icon-only re-authenticate action", () => {
  const button = fs.readFileSync("src/components/common/ReauthenticateAccountButton.tsx", "utf8");
  const antigravity = fs.readFileSync(
    "src/components/antigravity/AntigravityAccountActions.tsx",
    "utf8",
  );
  const codex = fs.readFileSync("src/components/codex/CodexAccountCard.tsx", "utf8");

  assert.match(button, /data-tooltip="Re-authenticate this account"/);
  assert.match(button, /aria-label="Re-authenticate this account"/);
  assert.match(button, /viewBox="0 0 24 24"/);
  assert.match(button, /M17\.1268 2\.15028/);
  assert.match(button, /fill="currentColor"/);
  assert.match(antigravity, /isAccountReauthenticationError\(cache\?\.error\)/);
  assert.match(antigravity, /<ReauthenticateAccountButton/);
  assert.ok(
    antigravity.indexOf("<ReauthenticateAccountButton") <
      antigravity.indexOf("className={`codex-card-refresh-btn"),
  );
  assert.match(codex, /isAccountReauthenticationError\(cache\?\.error\)/);
  assert.match(codex, /<ReauthenticateAccountButton/);
  assert.ok(codex.indexOf("<ReauthenticateAccountButton") < codex.indexOf("<CodexCardRefreshBtn"));
});

test("Codex usage refresh persists failures instead of leaving loading stuck", () => {
  const code = fs.readFileSync("src/hooks/codex/useCodexUsageFetcher.ts", "utf8");
  assert.match(
    code,
    /const errorText = accountErrorText\(error\)[\s\S]*loading:\s*false,\s*\n\s*error:\s*errorText/,
  );
  assert.match(code, /publishUsageEntry\(account\.id, failed\)/);
});

test("re-authenticate flow updates modal header to Re-authenticate {Platform name} account and renders Re-auth account first row", () => {
  const agModal = fs.readFileSync("src/components/antigravity/AddAntigravityAccountModal.tsx", "utf8");
  const codexModal = fs.readFileSync("src/components/codex/AddAccountModal.tsx", "utf8");
  const agBrowser = fs.readFileSync("src/components/antigravity/AntigravityOAuthStepView.tsx", "utf8");
  const codexBrowser = fs.readFileSync("src/components/codex/CodexBrowserLoginTab.tsx", "utf8");
  const banner = fs.readFileSync("src/components/common/ReauthAccountBanner.tsx", "utf8");
  const css = fs.readFileSync("src/styles/accounts/account-auth.css", "utf8");

  // Modal header matches "Re-authenticate {Platform name} account"
  assert.match(agModal, /reauthAccount\s*\?\s*["']Re-authenticate Antigravity account["']/);
  assert.match(codexModal, /reauthAccount\s*\?\s*["']Re-authenticate Codex account["']/);

  // Browser login tab content includes ReauthAccountBanner with first row "Re-auth account:"
  assert.match(agBrowser, /<ReauthAccountBanner/);
  assert.match(codexBrowser, /<ReauthAccountBanner/);
  assert.match(banner, />Re-auth account:</);
  assert.match(banner, /reauth-account-avatar/);
  assert.match(banner, /reauth-account-email/);

  // CSS defines row, avatar, and email styling
  assert.match(css, /\.reauth-account-row/);
  assert.match(css, /\.reauth-account-avatar/);
  assert.match(css, /\.reauth-account-email/);
});

