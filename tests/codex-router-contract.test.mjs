import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const router = fs.readFileSync('src-tauri/src/codex_router.rs', 'utf8');
const sync = fs.readFileSync('src-tauri/src/codex_sync.rs', 'utf8');

test('router provider uses the shared Codex model-provider responses contract', () => {
  assert.match(sync, /let provider_key = "quotashift_router"/);
  assert.match(sync, /doc\.insert\("model_provider",\s*toml_edit::value\(provider_key\)\)/);
  assert.match(sync, /router_table\.insert\("wire_api",\s*toml_edit::value\("responses"\)\)/);
  assert.match(sync, /router_table\.insert\("base_url",\s*toml_edit::value\(loopback_url\)\)/);
});

test('router status exposes conservative shared-provider coverage only', () => {
  assert.match(router, /"sharedProvider"\.to_string\(\)/);
  assert.match(router, /"configured"\.to_string\(\)/);
  assert.doesNotMatch(router, /"codexCli"|"codexDesktop"|"desktopApp"|"cliProcess"/);
});
