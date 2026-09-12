import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settingsCode = readFileSync('src/components/common/SettingsModal.tsx', 'utf8');
const settingsCss = readFileSync('src/styles/settings-modal.css', 'utf8');

test('settings modal shows the current app version as a changelog link', () => {
  assert.match(
    settingsCode,
    /import\s+\{\s*openUrl\s*\}\s+from\s+["']@tauri-apps\/plugin-opener["']/,
    'SettingsModal must use the existing Tauri opener plugin for the changelog link'
  );
  assert.match(
    settingsCode,
    /import\s+appPackage\s+from\s+["']\.\.\/\.\.\/\.\.\/package\.json["']/,
    'SettingsModal must derive the displayed version from package.json'
  );
  assert.match(
    settingsCode,
    /https:\/\/github\.com\/the-long-ride\/QuotaShift\/blob\/main\/CHANGELOG\.md/,
    'SettingsModal must link to the repository changelog on GitHub'
  );
  assert.match(
    settingsCode,
    /className=["']settings-modal-version-link["'][\s\S]*?onClick=\{\(\) => void openUrl\(CHANGELOG_URL\)\}[\s\S]*?v\{appPackage\.version\}/,
    'SettingsModal must render the current version and open the changelog when clicked'
  );
  assert.match(
    settingsCss,
    /\.settings-modal-version-link\s*\{[\s\S]*?color:\s*var\(--text-secondary\);/,
    'Version link must use the secondary text color'
  );
});
