import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { readWithCssImports } from './css-helper.mjs';

const read = (path) => readWithCssImports(path);

test('Codex tab exposes model pools without removing individual account actions', () => {
  const tab = read('src/components/codex/CodexTab.tsx');
  assert.match(tab, /Model Pools/);
  assert.match(tab, /onApplyPool/);
  assert.match(tab, /onNewPool/);
  assert.match(tab, /onEditPool/);
  assert.match(tab, /onDeletePool/);
  assert.match(tab, /onApply/);
  assert.match(tab, /onTrack/);
  assert.match(tab, /onSwitchBest/);
});

test('pool card exposes capacity and pool actions', () => {
  const card = read('src/components/codex/CodexPoolCard.tsx');
  assert.match(card, /Apply best/);
  assert.match(card, /aggregateCodexPoolCapacity/);
  assert.match(card, /Primary|Session/);
  assert.match(card, /Secondary|Weekly/);
  assert.match(card, /onEdit/);
  assert.match(card, /onDelete/);
});

test('pool editor keeps manual model entry while persisting model selection mode', () => {
  const modal = read('src/components/codex/CodexPoolModal.tsx');
  assert.match(modal, /model/);
  assert.match(modal, /modelSelectionMode/);
  assert.match(modal, /accountIds/);
  assert.match(modal, /autoSwitch/);
  assert.doesNotMatch(modal, /GPT-5\.6-Terra|GPT-5\.6-Sol|GPT-6-Astra/);
});

test('pool auto-switch control is an accessible switch instead of a checkbox', () => {
  const modal = read('src/components/codex/CodexPoolModal.tsx');
  const styles = read('src/styles.css');
  const inputBlocks = [...modal.matchAll(/<input[\s\S]*?\/>/g)].map((match) => match[0]);

  assert.match(modal, /role="switch"/);
  assert.match(modal, /aria-checked=\{autoSwitch\}/);
  assert.match(modal, /codex-pool-switch/);
  assert.ok(
    inputBlocks.every((input) => !input.includes('checked={autoSwitch}')),
    'autoSwitch must not be represented by an input checkbox',
  );
  assert.match(styles, /\.codex-pool-switch/);
});

test('pool modal renders Select all and Unselect all buttons in the Members row', () => {
  const modal = read('src/components/codex/CodexPoolModal.tsx');
  const styles = read('src/styles.css');
  assert.match(modal, /Members<\/div>[\s\S]*?Select all[\s\S]*?Unselect all/);
  assert.match(modal, /codex-pool-members-action-btn/);
  assert.match(modal, /setAccountIds\(accounts\.map\(\(a\)\s*=>\s*a\.id\)\)/);
  assert.match(modal, /setAccountIds\(\[\]\)/);
  assert.match(styles, /\.codex-pool-members-action-btn/);
});

test('pool modal closes upon saving in handleSave and App handleSaveCodexPool', () => {
  const modal = read('src/components/codex/CodexPoolModal.tsx');
  const app = read('src/App.tsx');
  assert.match(modal, /handleSave\s*=\s*\(\)\s*=>\s*\{[\s\S]*?onSave\([\s\S]*?\);[\s\S]*?onClose\(\);/);
  assert.match(app, /handleSaveCodexPool[\s\S]*?setPoolModalOpen\(false\)/);
});

