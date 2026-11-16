import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const oauthRs = fs.readFileSync("src-tauri/src/auth/oauth.rs", "utf8");
const oauthUtilsRs = fs.readFileSync("src-tauri/src/auth/oauth/utils.rs", "utf8");
const typesTs = fs.readFileSync("src/utils/common/types.ts", "utf8");
const addModalTsx = fs.readFileSync(
  "src/components/antigravity/modal/AddAntigravityAccountModal.tsx",
  "utf8",
);
const captureTabTsx = fs.readFileSync(
  "src/components/antigravity/modal/AntigravityCaptureTab.tsx",
  "utf8",
);
const localSessionHookTs = fs.readFileSync(
  "src/components/antigravity/modal/useLocalAntigravitySession.ts",
  "utf8",
);

test("oauth.rs exposes audit_granted_scopes for space/comma-delimited scope checks", () => {
  assert.match(
    oauthRs,
    /pub\s+fn\s+audit_granted_scopes\s*\(\s*granted_scope:\s*&str\s*\)\s*->\s*Vec<&'static str>/,
  );
  assert.match(oauthRs, /c\.is_whitespace\(\)\s*\|\|\s*c\s*==\s*','/);
  assert.match(oauthRs, /AG_GOOGLE_SCOPES\s*\.split_whitespace\(\)/);
  assert.match(oauthRs, /#\[test\]\s*fn\s+audit_granted_scopes_/);
});

test("types.ts adds authSource to AntigravityAccount", () => {
  assert.match(
    typesTs,
    /export interface AntigravityAccount[\s\S]*?authSource\?:\s*"native_capture"\s*\|\s*"browser_oauth";/,
  );
});

test("AddAntigravityAccountModal tags authSource and upgrades matching email in-place", () => {
  assert.match(addModalTsx, /authSource:\s*"browser_oauth"/);
  assert.match(addModalTsx, /createNativeCaptureAccountHandler\(/);
  assert.match(localSessionHookTs, /authSource:\s*"native_capture"/);
  assert.match(
    localSessionHookTs,
    /candidate\.email\?\.trim\(\)\.toLowerCase\(\)\s*===\s*existingEmail/,
  );
  assert.match(
    localSessionHookTs,
    /\.\.\.existing,[\s\S]*?authSource:\s*"native_capture"\s*as\s*const/,
  );
  assert.match(
    localSessionHookTs,
    /ops\.saveAccounts\(sortByOrder\(updated,\s*loadAccountOrder\(ANTIGRAVITY_ORDER_KEY\)\)\)/,
  );
});

test("AntigravityCaptureTab auto-probes read_antigravity_sessions on mount and shows detected email banner", () => {
  assert.match(localSessionHookTs, /export function useProbeLocalAntigravitySession/);
  assert.match(
    localSessionHookTs,
    /invoke<CapturedAntigravitySource\[\]>\("read_antigravity_sessions"\)/,
  );
  assert.match(captureTabTsx, /useProbeLocalAntigravitySession\(\)/);
  assert.match(captureTabTsx, /\{detectedEmail\s*&&\s*\(/);
  assert.match(captureTabTsx, /Active Antigravity 2\.0 session detected \(\{detectedEmail\}\)/);
});

test("exchange_antigravity_google_token runs live scope audit with tokeninfo fallback", () => {
  assert.match(oauthRs, /json\.get\("scope"\)\.and_then\(\|v\| v\.as_str\(\)\)/);
  assert.match(oauthRs, /fetch_tokeninfo_scope\(&client,\s*token\)\.await/);
  assert.match(oauthRs, /audit_granted_scopes/);
  assert.match(oauthRs, /apply_scope_audit\(&mut json,\s*&missing_scopes\)/);
  assert.match(oauthUtilsRs, /https:\/\/oauth2\.googleapis\.com\/tokeninfo/);
  assert.match(oauthUtilsRs, /"missingScopes"/);
  assert.match(oauthUtilsRs, /"scopeAuditPassed"/);
});

test("AddAntigravityAccountModal warns user to use Capture Local Session when scopeAuditPassed is false", () => {
  assert.match(addModalTsx, /tokenJson\.scopeAuditPassed\s*===\s*false/);
  assert.match(
    addModalTsx,
    /showToast\(buildOAuthScopeWarningMessage\(tokenJson\.missingScopes\),\s*"warning"\)/,
  );
  assert.match(localSessionHookTs, /export function buildOAuthScopeWarningMessage/);
  assert.match(localSessionHookTs, /Capture Local Session for full Antigravity 2\.0 permissions/);
});
