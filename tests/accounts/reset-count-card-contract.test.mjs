import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Claude and Codex cards put the shared reset count control before the tier badge", () => {
  const claudeCard = read("src/components/claude/ClaudeAccountCards.tsx");
  const codexCard = read("src/components/codex/CodexAccountCard.tsx");

  assert.ok(
    claudeCard.indexOf("<AccountResetCount") <
      claudeCard.indexOf('className="account-card-plan-badge"'),
  );
  assert.ok(
    codexCard.indexOf("<AccountResetCount") <
      codexCard.indexOf('className="codex-card-tier-badge"'),
  );
});

test("Codex reset count stays before the tier badge and aligns to the right", () => {
  const codexCard = read("src/components/codex/CodexAccountCard.tsx");
  const compactMode = read("src/styles/codex/codex-cards.css");
  const resetCount = codexCard.indexOf("<AccountResetCount");
  const tierBadge = codexCard.indexOf('className="codex-card-tier-badge"');

  assert.ok(resetCount < tierBadge);
  assert.match(
    compactMode,
    /\.codex-card-title-wrap > \.account-reset-count\s*\{\s*margin-left:\s*auto;/,
  );
});

test("compact Codex account cards remove the empty info gutter beside quota bars", () => {
  const compactMode = read("src/styles/desktop/compact-mode.css");

  assert.match(
    compactMode,
    /\[data-card-mode="compact"\] \[id\^="codex-account-"\] \.codex-card-row \.codex-card-info\s*\{\s*display:\s*none !important;/,
  );
});

test("reset-count links show the requested detail tooltip", () => {
  const resetCount = read("src/components/common/AccountResetCount.tsx");

  assert.match(resetCount, /data-tooltip="Click to see detail"/);
});

test("Claude reset details enumerate each returned grant and its expiry", () => {
  const dialog = read("src/components/claude/ClaudeResetCreditsDialog.tsx");
  const shared = read("src/components/common/ResetCreditsDialog.tsx");

  assert.match(dialog, /credits\?\.grants/);
  assert.match(dialog, /grant\.resetsLeft/);
  assert.match(dialog, /grant\.expiresAt/);
  assert.match(dialog, /<ResetCreditsDialog/);
  assert.match(shared, /role="dialog"/);
  assert.doesNotMatch(shared, /className="reset-credits-footer"/);
});

test("Claude and Codex reset details use the same dialog without a footer close button", () => {
  const claude = read("src/components/claude/ClaudeResetCreditsDialog.tsx");
  const codex = read("src/components/codex/CodexResetCreditsDialog.tsx");
  const shared = read("src/components/common/ResetCreditsDialog.tsx");

  assert.match(claude, /<ResetCreditsDialog/);
  assert.match(codex, /<ResetCreditsDialog/);
  assert.match(shared, /className="codex-model-dialog-close"/);
  assert.doesNotMatch(shared, />\s*Close\s*<\/button>/);
});
