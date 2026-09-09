import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tab = fs.readFileSync('src/components/CodexTab.tsx', 'utf8');
const card = fs.readFileSync('src/components/CodexPoolCard.tsx', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');

test('Codex tab splits Accounts and Pools while keeping routing control global', () => {
  assert.match(tab, /useState<"accounts" \| "pools">\("accounts"\)/);
  assert.match(tab, />Accounts</);
  assert.match(tab, />Pools</);
  assert.match(tab, /Pool Routing/);
  assert.match(tab, /role="switch"/);
  assert.match(tab, /aria-checked=\{poolRoutingEnabled\}/);
  assert.match(tab, /codexSection === "pools"/);
  assert.match(tab, /codexSection === "accounts"/);
  assert.match(tab, /poolRoutingBusy/);
  assert.match(tab, /onTogglePoolRouting/);
});

test('routing status is wired through pool cards and styled', () => {
  assert.match(tab, /routerStatus=\{routerStatus\}/);
  assert.match(card, /routerStatus/);
  assert.match(card, /Last routed/);
  assert.match(card, /lastRoutedAccountId/);
  assert.match(card, /lastRoutedModel/);
  assert.match(styles, /\.codex-routing-panel/);
  assert.match(styles, /\.codex-subtabs/);
  assert.match(styles, /\.codex-subtab/);
});
