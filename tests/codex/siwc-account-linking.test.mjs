import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = (path) => fs.readFileSync(path, "utf8");

test("new Codex browser login opts into separate SIWC consent by default", () => {
  const modal = source("src/components/codex/modals/AddAccountModal.tsx");
  const browser = source("src/components/codex/modals/CodexBrowserLoginTab.tsx");
  assert.match(modal, /const \[enableModelRouting, setEnableModelRouting\] = useState\(true\)/);
  assert.match(modal, /authorizeModelRoutingAfterCodexLogin/);
  assert.match(browser, /<CommonSwitch/);
  assert.match(browser, /chatgpt\.tokens\.use\.direct/);
  assert.match(modal, /enableModelRouting=\{enableModelRouting\}/);
});

test("Codex existing account cards offer SIWC authorization and truthful linked status", () => {
  const card = source("src/components/codex/cards/CodexAccountCard.tsx");
  const tab = source("src/components/codex/CodexTab.tsx");
  assert.match(card, /<CodexCardSiwcAction/);
  const action = source("src/components/codex/cards/CodexCardSiwcAction.tsx");
  assert.match(action, /Authorize for Model Routing/);
  assert.match(action, /if \(authorized && !busy\)\s*\{\s*return null;\s*\}/);
  assert.doesNotMatch(action, /Routing Authorized/);
  assert.match(
    card,
    /data-tooltip="This account has been already authorized for routing\."[\s\S]*?<CodexCardDeleteBtn/,
  );
  assert.match(card, /codex-card-routing-ready-btn/);
  assert.match(card, /onAuthorizeSiwc/);
  assert.match(tab, /useCodexSiwcAccounts/);
  assert.match(tab, /siwcAccount=\{/);
});

test("only matching OpenAI subject can be linked; email never establishes identity", () => {
  const link = source("src/utils/codex/pools/codex-siwc-link.ts");
  const backend = source("src-tauri/src/codex/siwc/callback.rs");
  assert.match(link, /subject/);
  assert.match(link, /idToken/);
  assert.match(link, /expectedSubject/);
  assert.doesNotMatch(link, /\.email\s*===/);
  assert.match(backend, /expected_subject/);
  assert.match(backend, /identity\.subject\(\)/);
});

test("Codex OAuth sessions remain untouched when SIWC consent is declined", () => {
  const modal = source("src/components/codex/modals/AddAccountModal.tsx");
  assert.match(modal, /saveAccounts\(accounts\)/);
  assert.match(modal, /authorizeModelRoutingAfterCodexLogin/);
  assert.match(modal, /onAccountsAdded\(accountIds\)/);
  const link = source("src/utils/codex/pools/codex-siwc-link.ts");
  assert.doesNotMatch(link, /saveCodexAccounts|\bobfuscate\(/);
});

test("native SIWC registration is linked to one Codex workspace, not every workspace for same user", () => {
  const link = source("src/utils/codex/pools/codex-siwc-link.ts");
  const tab = source("src/components/codex/CodexTab.tsx");
  const rust = source("src-tauri/src/codex/siwc/token_exchange.rs");
  const commands = source("src-tauri/src/codex/siwc/commands.rs");
  assert.match(link, /linkedCodexAccountId === account\.id/);
  assert.match(link, /linkedCodexAccountId: account\.id/);
  assert.match(tab, /entry\.linkedCodexAccountId === acc\.id/);
  assert.match(rust, /linked_codex_account_id: old\.linked_codex_account_id/);
  assert.match(commands, /linked_codex_account_id: session\.linked_codex_account_id\(\)/);
});

test("Model Pools SIWC panel offers Copy Link and Cancel Login for interrupted browser flows", () => {
  const panel = source("src/components/codex/siwc/SiwcAccountPanel.tsx");
  const commands = source("src-tauri/src/codex/siwc/commands.rs");
  const lib = source("src-tauri/src/lib.rs");
  assert.match(panel, /Add SWIC Account/);
  assert.match(panel, /Copy Link/);
  assert.match(panel, /CopyLinkSvgIcon/);
  assert.match(panel, /navigator\.clipboard\.writeText/);
  assert.match(panel, /Cancel Login/);
  assert.match(panel, /cancel_siwc_sign_in/);
  assert.match(panel, /get_siwc_sign_in_status/);
  assert.match(panel, /qs-siwc-summary/);
  assert.match(panel, /qs-siwc-chevron/);
  assert.match(panel, /qs-siwc-panel-body/);
  assert.doesNotMatch(panel, /qs-siwc-account-list/);
  assert.match(commands, /pub fn cancel_siwc_sign_in/);
  assert.match(commands, /pub fn get_siwc_sign_in_status/);
  assert.match(lib, /codex::siwc::commands::cancel_siwc_sign_in/);
  assert.match(lib, /codex::siwc::commands::get_siwc_sign_in_status/);
});

test("Codex account cards offer Copy Link, Cancel Login, and disable other cards while one card is processing", () => {
  const action = source("src/components/codex/cards/CodexCardSiwcAction.tsx");
  const card = source("src/components/codex/cards/CodexAccountCard.tsx");
  const hook = source("src/components/codex/siwc/useCodexSiwcAccounts.ts");
  const tab = source("src/components/codex/CodexTab.tsx");
  assert.match(action, /Copy Link/);
  assert.match(action, /CopyLinkSvgIcon/);
  assert.match(action, /Cancel Login/);
  assert.match(action, /onCopyLink/);
  assert.match(action, /onCancel/);
  assert.match(action, /disabled=\{busy \|\| disableActions\}/);
  assert.match(card, /onCopySiwcLink/);
  assert.match(card, /onCancelSiwc/);
  assert.match(card, /isAnySiwcBusy/);
  assert.match(hook, /copySiwcAccountLink/);
  assert.match(hook, /cancelSiwcAccountLogin/);
  assert.match(hook, /get_siwc_sign_in_status/);
  assert.match(hook, /cancel_siwc_sign_in/);
  assert.match(tab, /onCopySiwcLink=/);
  assert.match(tab, /onCancelSiwc=/);
  assert.match(tab, /isAnySiwcBusy=/);
});

test("SIWC browser callback page shares the Add Account login dark centered CSS style", () => {
  const callback = source("src-tauri/src/codex/siwc/callback.rs");
  assert.match(callback, /background:#0a0a0a;font-family:system-ui;color:#fff;font-size:15px;/);
  assert.match(callback, /display:flex;align-items:center;justify-content:center;/);
});

test("Codex account card SIWC row is compact and hides authorize buttons once authorized", () => {
  const action = source("src/components/codex/cards/CodexCardSiwcAction.tsx");
  const card = source("src/components/codex/cards/CodexAccountCard.tsx");
  const css = source("src/styles/codex/codex-siwc-card.css");
  assert.match(action, /if \(planText === "FREE"\)\s*\{\s*return null;\s*\}/);
  assert.match(card, /planText=\{planText\}/);
  assert.match(action, /\(!authorized \|\| busy\) && \(/);
  assert.match(action, /AuthorizeRoutingSvgIcon/);
  assert.match(action, /codex-card-siwc-btn--authorize/);
  assert.match(css, /flex-wrap:\s*nowrap/);
});

test("Model Pool V2 editor defaults to SIWC when routable SIWC accounts exist and resolves linked account labels", () => {
  const editor = source("src/components/codex/pools-v2/CodexModelPoolV2Editor.tsx");
  const helpers = source("src/components/codex/pools/codex-pool-helpers.ts");
  assert.match(editor, /linkedCodexAccountId/);
  assert.match(editor, /freshPool\(siwcAccounts, accounts\)/);
  assert.match(helpers, /defaultPoolAuthMode/);
});
