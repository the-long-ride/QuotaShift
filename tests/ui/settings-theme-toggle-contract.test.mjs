import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settingsModalCode = readFileSync('src/components/common/SettingsModal.tsx', 'utf8');
const settingsModalCss = readFileSync('src/styles/settings/settings-modal.css', 'utf8');
const headerCode = readFileSync('src/components/common/Header.tsx', 'utf8');

test('SettingsModal renders theme toggle button to the left of close button in header actions', () => {
  assert.match(settingsModalCode, /className="settings-modal-header-actions"/);
  assert.match(settingsModalCode, /className="settings-modal-theme-toggle"/);
  assert.match(settingsModalCode, /className="settings-modal-close"/);
  assert.match(settingsModalCode, /<ThemeIcon\s+isDarkMode=\{isDarkMode\}\s*\/>/);

  const themeToggleIdx = settingsModalCode.indexOf('settings-modal-theme-toggle');
  const closeIdx = settingsModalCode.indexOf('settings-modal-close');
  assert.ok(themeToggleIdx > 0 && closeIdx > 0, 'Both buttons must exist');
  assert.ok(themeToggleIdx < closeIdx, 'Theme toggle must appear before (to the left of) the close button');
});

test('settings-modal.css ensures close button and theme toggle have no outline and share identical sizing', () => {
  assert.match(settingsModalCss, /\.settings-modal-theme-toggle,\s*\r?\n?\.settings-modal-close\s*\{/);
  assert.match(settingsModalCss, /border:\s*none;/);
  assert.match(settingsModalCss, /outline:\s*none;/);
  assert.match(settingsModalCss, /width:\s*20px;/);
  assert.match(settingsModalCss, /height:\s*20px;/);
  assert.match(settingsModalCss, /\.settings-modal-close:focus/);
});

test('Header delegates theme toggle to SettingsModal and removes standalone theme-toggle button', () => {
  assert.doesNotMatch(headerCode, /className="theme-toggle"/, 'Header bar should no longer contain standalone theme-toggle button');
  assert.match(headerCode, /<SettingsModal[\s\S]*?isDarkMode=\{isDarkMode\}[\s\S]*?onToggleTheme=\{onToggleTheme\}/);
});

test('settings-modal.css defines clean light mode segmented switch track and white active pill', () => {
  assert.match(settingsModalCss, /\[data-theme="light"\]\s+\.settings-segmented-switch\s*\{[^}]*background:\s*#e4e4e7;/);
  assert.match(settingsModalCss, /\[data-theme="light"\]\s+\.settings-segment-btn--active\s*\{[^}]*background:\s*#ffffff;/);
  assert.doesNotMatch(settingsModalCss, /\[data-theme="light"\]\s+\.settings-segment-btn--active\s*\{[^}]*background:\s*#18181b;/);
});

test('Settings Data tab renders each action as its own full-width row without a divider or backup group', () => {
  const dataBlock = settingsModalCode.match(/activeTab === "data"[\s\S]*?activeTab === "ui"/)?.[0] ?? '';
  assert.match(dataBlock, /Rescan all Codex models/);
  assert.match(dataBlock, /Export Backup/);
  assert.match(dataBlock, /Import Backup/);
  assert.doesNotMatch(dataBlock, /settings-backup-row/);
  assert.doesNotMatch(dataBlock, /settings-divider/);
  assert.match(settingsModalCss, /\.settings-action-row\s*\{[^}]*width:\s*100%;/);
});

