import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dialogSource = fs.readFileSync('src/components/codex/router-server/CodexRegenerateKeyDialog.tsx', 'utf8');
const panelSource = fs.readFileSync('src/components/codex/router-server/CodexRouterServerPanel.tsx', 'utf8');
const controlsSource = fs.readFileSync('src/components/codex/router-server/CodexRouterServerControls.tsx', 'utf8');
const libSource = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
const commandsSource = fs.readFileSync('src-tauri/src/claude/inventory/commands.rs', 'utf8');

test('CodexRegenerateKeyDialog defines confirm dialog with default-ON switch', () => {
  assert.match(dialogSource, /Regenerate Model Routing Key/);
  assert.match(dialogSource, /useState\(true\)/);
  assert.match(dialogSource, /CommonSwitch/);
  assert.match(
    dialogSource,
    /Update key in settings\.json of all Claude profiles created by QuotaShift/,
  );
  assert.match(dialogSource, /onConfirm\(updateClaudeProfiles\)/);
  assert.match(dialogSource, /Cancel/);
  assert.match(dialogSource, /Regenerate/);
});

test('CodexRouterServerPanel wires key regeneration confirm dialog and toast logic', () => {
  assert.match(panelSource, /<CodexRegenerateKeyDialog/);
  assert.match(panelSource, /update_claude_profiles_routing_key/);
  assert.match(
    panelSource,
    /QuotaShift model routing key has been updated for these claude profiles:\s*\$\{updatedProfileNames\.join\(", "\)\}/,
  );
  assert.match(
    panelSource,
    /QuotaShift model routing key has been re-generated\./,
  );
  assert.match(panelSource, /showAppToast/);
});

test('CodexRouterServerControls invokes onStartRotateConfirm on key regenerate button', () => {
  assert.match(controlsSource, /aria-label="Regenerate key"/);
  assert.match(controlsSource, /onClick=\{onStartRotateConfirm\}/);
});

test('Tauri backend registers update_claude_profiles_routing_key command', () => {
  assert.match(commandsSource, /pub fn update_claude_profiles_routing_key/);
  assert.match(libSource, /claude::inventory::update_claude_profiles_routing_key/);
});

test('CodexRouterServerLogs uses SVG icons for Errors, Copy, and Clear', () => {
  const logsSource = fs.readFileSync('src/components/codex/router-server/CodexRouterServerLogs.tsx', 'utf8');
  assert.match(logsSource, /<LogErrorsIcon/);
  assert.match(logsSource, /<LogClearIcon/);
  assert.match(logsSource, /<CopySvgIcon/);
  assert.match(logsSource, /clear_codex_router_logs/);
  assert.match(libSource, /codex_router::clear_codex_router_logs/);
});

test('SiwcAccountPanel is renamed to Model routing pools and includes New Pool button', () => {
  const siwcSource = fs.readFileSync('src/components/codex/siwc/SiwcAccountPanel.tsx', 'utf8');
  const panelV2Source = fs.readFileSync('src/components/codex/pools-v2/CodexModelPoolsV2Panel.tsx', 'utf8');
  assert.match(siwcSource, /Model routing pools/);
  assert.match(siwcSource, /onNewPool/);
  assert.match(siwcSource, /codex-pool-new-btn/);
  assert.match(panelV2Source, /onNewPool=\{/);
});

