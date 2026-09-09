import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const router = fs.existsSync('src/utils/codex-router.ts') ? fs.readFileSync('src/utils/codex-router.ts', 'utf8') : '';

test('App owns the persistent boolean routing preference and backend lifecycle', () => {
  assert.match(app, /quotashift_codex_pool_routing_v1/);
  assert.match(app, /poolRoutingEnabledRef/);
  assert.match(app, /start_codex_router/);
  assert.match(app, /configure_codex_router/);
  assert.match(app, /stop_codex_router/);
  assert.match(app, /get_codex_router_status/);
  assert.match(app, /localStorage\.setItem\(CODEX_POOL_ROUTING_KEY,\s*"true"\)/);
  assert.match(app, /localStorage\.setItem\(CODEX_POOL_ROUTING_KEY,\s*"false"\)/);
  assert.match(app, /Failed to start Codex pool routing/);
});

test('router snapshot is transient and response-driven', () => {
  assert.match(router, /decodeCredential/);
  assert.match(router, /normalizeCodexUsageWindows/);
  assert.match(router, /availableModelIds/);
  assert.match(router, /remainingPercent/);
  assert.doesNotMatch(router, /localStorage/);
  assert.match(app, /buildCodexRouterConfig/);
  assert.match(app, /150/);
});

test('pool apply activation and routing-safe account apply are wired', () => {
  assert.match(app, /activatedAt:\s*Date\.now\(\)/);
  assert.match(app, /poolRoutingEnabledRef\.current/);
  assert.match(app, /OPENAI_API_KEY/);
  assert.match(app, /poolRoutingEnabled=\{poolRoutingEnabled\}/);
  assert.match(app, /poolRoutingBusy=\{poolRoutingBusy\}/);
  assert.match(app, /routerStatus=\{routerStatus\}/);
  assert.match(app, /onTogglePoolRouting=\{handleToggleCodexPoolRouting\}/);
});
