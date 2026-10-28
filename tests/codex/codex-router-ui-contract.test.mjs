import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { readWithCssImports } from '../css-helper.mjs';

const tab = fs.readFileSync('src/components/codex/CodexTab.tsx', 'utf8');
const card = fs.readFileSync('src/components/codex/pools/CodexPoolCard.tsx', 'utf8');
const panel = fs.readFileSync('src/components/codex/pools-v2/CodexModelPoolsV2Panel.tsx', 'utf8');
const serverPanel = fs.readFileSync('src/components/codex/router-server/CodexRouterServerPanel.tsx', 'utf8');
const switchSource = fs.readFileSync('src/components/common/CommonSwitch.tsx', 'utf8');
const styles = readWithCssImports('src/styles.css');

test('Codex tab splits Accounts and Pools while keeping routing control global', () => {
  assert.match(tab, /useState<"accounts" \| "pools">\("accounts"\)/);
  assert.match(tab, />\s*Accounts\s*</);
  assert.match(tab, />\s*Model Pools\s*</);
  assert.match(panel, /Pool Routing/);
  assert.match(serverPanel, /<CommonSwitch/);
  assert.match(switchSource, /role="switch"/);
  assert.match(switchSource, /aria-checked=\{checked\}/);
  assert.match(serverPanel, /checked=\{Boolean\(poolRoutingEnabled\)\}/);
  assert.match(serverPanel, /confirmStop/);
  assert.match(serverPanel, /Stop Router Server/);
  assert.match(panel, /poolRoutingEnabled=\{poolRoutingEnabled\}/);
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

test('router server panel displays token usage and cache hit telemetry counters', () => {
  const statsSource = fs.readFileSync('src/components/codex/router-server/CodexRouterServerStats.tsx', 'utf8');
  const helpers = fs.readFileSync('src/components/codex/router-server/codex-router-server-helpers.ts', 'utf8');
  assert.match(statsSource, /totalInputTokens/);
  assert.match(statsSource, /totalOutputTokens/);
  assert.match(statsSource, /totalCachedTokens/);
  assert.match(statsSource, /cacheHitRequests/);
  assert.match(statsSource, /formatCompactTokens/);
  assert.match(statsSource, /formatCacheHitPercentage/);
  assert.match(helpers, /export function formatCompactTokens/);
  assert.match(helpers, /export function formatCacheHitPercentage/);
});
