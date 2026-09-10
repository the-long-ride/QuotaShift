import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { readWithCssImports } from './css-helper.mjs';

const read = (path) => readWithCssImports(path);
const modal = read('src/components/CodexPoolModal.tsx');
const styles = read('src/styles.css');

// Task 5 contracts cover the card action, dialog content, and compact scroll behavior.
test('pool model editor is an editable discovered-model combobox', () => {
  assert.match(modal, /buildCodexTierModelGroups/);
  assert.match(modal, /validateCodexPoolModel/);
  assert.match(modal, /role="combobox"/);
  assert.match(modal, /role="listbox"/);
  assert.match(modal, /role="option"/);
  assert.match(modal, /modelSelectionMode/);
  assert.match(modal, /setModelSelectionMode\("manual"\)/);
  assert.match(modal, /setModelSelectionMode\("discovered"\)/);
});

test('strict discovered validation blocks Save while manual compatibility is warning-only', () => {
  assert.match(modal, /validation\.canSave/);
  assert.match(modal, /validation\.warning/);
  assert.match(modal, /disabled=\{[^}]*validation\.canSave/);
  assert.match(modal, /validation\.reasons/);
});

test('member list is a five-row scroller with account identity plan and compatibility', () => {
  assert.match(modal, /codex-pool-member-list/);
  assert.match(styles, /\.codex-pool-member-list\s*\{[\s\S]*?max-height:\s*170px;[\s\S]*?overflow-y:\s*auto;/);
  assert.match(modal, /account\.label/);
  assert.match(modal, /account\.email/);
  assert.match(modal, /account\.lastPlan/);
  assert.match(modal, /compatib/i);
});

test('member selection uses the approved custom accessible checkbox artwork', () => {
  assert.match(modal, /<button[\s\S]*?role="checkbox"/);
  assert.match(modal, /aria-checked=\{[^}]+\}/);
  assert.match(modal, /m24 24h-24v-24h18\.4v2\.4h-16v19\.2h20v-8\.8h2\.4v11\.2zm-19\.52-12\.42 1\.807-1\.807 5\.422 5\.422 13\.68-13\.68 1\.811 1\.803-15\.491 15\.491z/);
  assert.match(modal, /m24 24h-24v-24h24\.8v24zm-1\.6-2\.4v-19\.2h-20v19\.2z/);
});

test('Codex account card exposes a Show available models icon action before Apply', () => {
  const tab = read('src/components/CodexTab.tsx');
  assert.match(tab, /CodexAvailableModelsDialog/);
  assert.match(tab, /data-tooltip="Show available models"/);
  assert.match(tab, /onShowAvailableModels|availableModelsAccount/);
  assert.match(tab, /Show available models[\s\S]*?(?:Set this account as the active workspace account|card-apply-btn)/);
});

test('available models dialog includes identity plan scan status filter models and SVG rescan button with tooltip', () => {
  const path = 'src/components/CodexAvailableModelsDialog.tsx';
  assert.equal(fs.existsSync(path), true, 'CodexAvailableModelsDialog.tsx must exist');
  const dialog = read(path);
  assert.match(dialog, /CodexAvailableModelsDialog/);
  assert.match(dialog, /account\.label/);
  assert.match(dialog, /account\.email/);
  assert.match(dialog, /lastPlan|planName/);
  assert.match(dialog, /fetchedAt|scan/i);
  assert.match(dialog, /placeholder="Filter models"/);
  assert.match(dialog, /entry\?\.models|entry\.models/);
  assert.match(dialog, /data-tooltip="Rescan"/);
  assert.match(dialog, /aria-label="Rescan"/);
  assert.match(dialog, /codex-model-dialog-rescan-icon/);
  assert.match(dialog, /onRescan\(account\)/);
});

test('available models dialog is compact and only its model list scrolls with a thin scrollbar and left-aligned identity', () => {
  assert.match(styles, /\.codex-model-dialog\s*\{[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*0;[\s\S]*?max-height:\s*min\(70vh,\s*520px\);/);
  assert.match(styles, /\.codex-model-dialog\s*\{[^}]*text-align:\s*left/s);
  assert.match(styles, /\.codex-model-dialog-identity\s*\{[^}]*align-items:\s*flex-start/s);
  assert.match(styles, /\.codex-model-dialog-identity\s*\{[^}]*text-align:\s*left/s);
  assert.match(styles, /\.codex-model-dialog-list\s*\{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(styles, /\.codex-model-dialog-list\s*\{[^}]*scrollbar-width:\s*thin/s);
  assert.match(styles, /\.codex-model-dialog-list::-webkit-scrollbar\s*\{[^}]*width:\s*3px/s);
  assert.match(styles, /\.codex-model-dialog-list::-webkit-scrollbar-track\s*\{[^}]*background:\s*transparent/s);
  assert.match(styles, /\.codex-model-dialog-body\s*\{[\s\S]*?overflow:\s*hidden;/);
});
