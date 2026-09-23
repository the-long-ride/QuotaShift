import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const router = fs.readFileSync('src-tauri/src/codex/router.rs', 'utf8');
const sync = fs.readFileSync('src-tauri/src/codex/sync.rs', 'utf8');

test('router provider uses the shared Codex model-provider responses contract', () => {
  assert.match(sync, /let provider_key = "quotashift_router"/);
  assert.match(sync, /doc\.insert\("model_provider",\s*toml_edit::value\(provider_key\)\)/);
  assert.match(sync, /router_table\.insert\("wire_api",\s*toml_edit::value\("responses"\)\)/);
  assert.match(sync, /router_table\.insert\("base_url",\s*toml_edit::value\(loopback_url\)\)/);
});

test('router provider carries a transient custom listener credential without exposing it in status', () => {
  assert.match(sync, /http_headers/);
  assert.match(sync, /X-QuotaShift-Token/);
  assert.match(router, /ROUTER_AUTH_HEADER/);
  const statusStart = router.indexOf('pub struct CodexRouterStatus');
  const statusEnd = router.indexOf('struct ListenerRuntime', statusStart);
  const status = router.slice(statusStart, statusEnd);
  assert.doesNotMatch(status, /secret/i);
});

test('router status exposes conservative shared-provider coverage only', () => {
  assert.match(router, /"sharedProvider"\.to_string\(\)/);
  assert.match(router, /"configured"\.to_string\(\)/);
  assert.doesNotMatch(router, /"codexCli"|"codexDesktop"|"desktopApp"|"cliProcess"/);
});
