import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { readWithCssImports } from "./css-helper.mjs";

const read = (path) => readWithCssImports(path);

test("Codex tab exposes model pools without removing individual account actions", () => {
  const tab = read("src/components/codex/CodexTab.tsx");
  assert.match(tab, /Model Pools/);
  assert.match(tab, /onActivatePool/);
  assert.match(tab, /onNewPool/);
  assert.match(tab, /onEditPool/);
  assert.match(tab, /onDeletePool/);
  assert.match(tab, /onApply/);
  assert.match(tab, /onTrack/);
  assert.match(tab, /onSwitchBest/);
});

test("pool card keeps usage out of the card and exposes routing actions", () => {
  const card = read("src/components/codex/CodexPoolCard.tsx");
  assert.match(card, /Use this pool for routing/);
  assert.match(card, /onEdit/);
  assert.match(card, /onDelete/);
  assert.doesNotMatch(card, /aggregateCodexPoolCapacity|Primary \/ Session|Secondary \/ Weekly/);
  assert.doesNotMatch(card, /Selected pool|Selected for routing|Not selected/);
});

test("pool card shows non-zero auth member counts before its actions and uses an icon-only edit action", () => {
  const card = read("src/components/codex/CodexPoolCard.tsx");
  const flow = fs.readFileSync("src/styles/account-card-flow.css", "utf8");

  assert.match(card, /isCodexAccountOAuth\(account, usageCache\[account\.id\]\)/);
  assert.match(card, /if \(oauthMemberCount > 0\) authSummaryParts\.push/);
  assert.match(card, /if \(apiKeyMemberCount > 0\) authSummaryParts\.push/);
  assert.match(card, /authSummaryParts\.join\(", "\) \|\| "Pool empty"/);
  assert.match(
    card,
    /codex-card-header-actions[\s\S]*codex-pool-auth-summary[\s\S]*\{authSummary\}[\s\S]*card-apply-btn/,
  );
  assert.match(card, /account-action-btn account-action-btn--icon-only codex-pool-edit-btn/);
  assert.match(card, /aria-label="Edit this model pool"/);
  assert.match(card, /M12\.4445 19\.6875H20\.9445/);
  assert.doesNotMatch(card, />\s*Edit\s*<\/button>/);
  assert.match(flow, /\.codex-pool-auth-summary\s*\{[^}]*white-space:\s*nowrap;/s);
  assert.match(flow, /\.codex-pool-edit-btn svg\s*\{[^}]*width:\s*13px;[^}]*height:\s*13px;/s);
  assert.match(
    flow,
    /\.codex-pool-edit-btn\s*\{[^}]*width:\s*22px;[^}]*min-width:\s*22px;[^}]*height:\s*22px;/s,
  );
});

test("pool editor keeps manual model entry while persisting model selection mode", () => {
  const modal = read("src/components/codex/CodexPoolModal.tsx");
  assert.match(modal, /model/);
  assert.match(modal, /modelSelectionMode/);
  assert.match(modal, /accountIds/);
  assert.doesNotMatch(modal, /GPT-5\.6-Terra|GPT-5\.6-Sol|GPT-6-Astra/);
});

test("pool modal renders Select all and Unselect all buttons in the Members row", () => {
  const modal = read("src/components/codex/CodexPoolModal.tsx");
  const styles = read("src/styles.css");
  assert.match(modal, /Members<\/div>[\s\S]*?Select all[\s\S]*?Unselect all/);
  assert.match(modal, /codex-pool-members-action-btn/);
  assert.match(modal, /setAccountIds\(accounts\.map\(\(a\)\s*=>\s*a\.id\)\)/);
  assert.match(modal, /setAccountIds\(\[\]\)/);
  assert.match(styles, /\.codex-pool-members-action-btn/);
});

test("pool modal closes upon saving in handleSave and App handleSaveCodexPool", () => {
  const modal = read("src/components/codex/CodexPoolModal.tsx");
  const app = read("src/App.tsx");
  assert.match(
    modal,
    /handleSave\s*=\s*\(\)\s*=>\s*\{[\s\S]*?onSave\([\s\S]*?\);[\s\S]*?onClose\(\);/,
  );
  assert.match(app, /handleSaveCodexPool[\s\S]*?setPoolModalOpen\(false\)/);
});

test("pool card uses the account-card shell without inline usage bars", () => {
  const card = read("src/components/codex/CodexPoolCard.tsx");
  assert.match(card, /account-card codex-pool-card/);
  assert.match(card, /codex-card-row codex-pool-card-row/);
  assert.doesNotMatch(card, /codex-card-limits|quota-limits-container|data-usage-tone/);
});

test("new pool action vertically centers its icon and text", () => {
  const section = fs.readFileSync("src/components/codex/CodexPoolsSection.tsx", "utf8");
  const css = fs.readFileSync("src/styles/codex-pools.css", "utf8");
  assert.match(section, /codex-pool-new-btn/);
  assert.match(section, /<CodexAddIcon\s*\/>/);
  assert.match(
    css,
    /\.codex-pool-new-btn\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*line-height:\s*1;/s,
  );
  assert.match(css, /\.codex-pool-new-btn svg\s*\{[^}]*display:\s*block;/s);
});

test("pool modal secondary action uses outline styling", () => {
  const footer = fs.readFileSync("src/components/codex/CodexPoolModalFooter.tsx", "utf8");
  const styles = fs.readFileSync("src/styles/modals.css", "utf8");
  assert.match(footer, /dialog-btn dialog-btn--secondary/);
  assert.match(styles, /\.dialog-btn--secondary[\s\S]*border:\s*1px solid var\(--border-color\)/);
});

test("pool cards use account flow columns and open member usage in a modal", () => {
  const list = read("src/components/codex/CodexPoolsList.tsx");
  const card = read("src/components/codex/CodexPoolCard.tsx");
  const modal = read("src/components/codex/CodexPoolUsageModal.tsx");
  const flow = fs.readFileSync("src/styles/account-card-flow.css", "utf8");
  const modalStyles = fs.readFileSync("src/styles/account-card-flow.css", "utf8");

  assert.match(list, /useAccountCardGridColumns\(\)/);
  assert.match(list, /codex-accounts-container codex-pools-flow/);
  assert.match(card, /pool\.name\.trim\(\)\.charAt\(0\)\.toUpperCase\(\)/);
  assert.match(card, /className="codex-card-avatar codex-pool-avatar"/);
  assert.match(card, /setUsageModalOpen\(true\)/);
  assert.match(card, /<CodexPoolUsageModal/);
  assert.doesNotMatch(card, /aria-expanded=|usageExpanded|handleToggleUsage/);
  assert.match(modal, /buildCodexPoolMemberUsageRows/);
  assert.match(modal, /onRefreshMember/);
  assert.match(modal, /codex-pool-member-usage-row/);
  assert.match(
    flow,
    /\.codex-pool-avatar\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;[^}]*font-size:\s*14px;[^}]*line-height:\s*1;/s,
  );
  assert.match(modalStyles, /\.dialog-box--pool-usage\s*\{[^}]*width:\s*520px;/s);
});

test("pool usage reads shared cache and only refreshes on explicit modal action", () => {
  const tab = read("src/components/codex/CodexTab.tsx");
  const modal = read("src/components/codex/CodexPoolUsageModal.tsx");
  assert.doesNotMatch(tab, /codexSection !== "pools"[\s\S]*onRefresh\(account\)/);
  assert.doesNotMatch(modal, /useEffect\(|if \(!isOpen \|\| !onRefreshMember\)/);
  assert.match(modal, /const refreshMembers = async/);
  assert.match(modal, /Promise\.all\(members\.map/);
  assert.match(modal, /usageCache\[account\.id\]\?\.loading/);
  assert.match(modal, /\{refreshing \? "Refreshing…" : "Refresh"\}/);
});

test("pool usage columns and values are left aligned", () => {
  const flow = fs.readFileSync("src/styles/account-card-flow.css", "utf8");
  assert.match(
    flow,
    /\.codex-pool-usage-columns,[\s\S]*\.codex-pool-member-usage-row[\s\S]*justify-items:\s*start;[\s\S]*text-align:\s*left;/,
  );
  assert.match(flow, /\.codex-pool-member-usage-limits\s*\{[^}]*justify-content:\s*flex-start;/s);
});

test("pool usage modal scrolls only its member table body", () => {
  const flow = fs.readFileSync("src/styles/account-card-flow.css", "utf8");
  assert.match(
    flow,
    /\.codex-pool-usage-modal\s*\{[^}]*overflow-y:\s*hidden !important;/s,
  );
  assert.match(
    flow,
    /\.codex-pool-member-usage-list\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s,
  );
  assert.match(flow, /\.codex-pool-member-usage-list::-webkit-scrollbar\s*\{/);
});


test("pool avatar keeps a square geometry with minimal corner rounding", () => {
  const flow = fs.readFileSync("src/styles/account-card-flow.css", "utf8");
  assert.match(
    flow,
    /\.codex-pool-avatar\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;[^}]*aspect-ratio:\s*1 \/ 1;[^}]*border-radius:\s*3px;/s,
  );
});
