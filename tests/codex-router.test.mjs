import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexRouterConfig } from '../.test-build/codex-router.js';

test('buildCodexRouterConfig decodes credentials transiently and normalizes model/quota data', () => {
  const decoded = new Map([
    ['oauth-secret', JSON.stringify({ accessToken: 'access-a', refreshToken: 'refresh-a', accountId: 'acct-a' })],
    ['api-secret', 'sk-test'],
  ]);
  const config = buildCodexRouterConfig({
    accounts: [
      { id: 'a', label: 'A', apiKey: 'oauth-secret' },
      { id: 'b', label: 'B', apiKey: 'api-secret' },
    ],
    pools: [{ id: 'p', name: 'P', model: 'gpt-5.6-sol', accountIds: ['a', 'b'], autoSwitch: true, activatedAt: 123 }],
    usageCache: {
      a: { fetchedAt: 456, rate_limit: { primary_window: { used_percent: 25, window_duration_mins: 300 } } },
    },
    modelCache: {
      a: { accountId: 'a', planName: 'Plus', models: [{ id: 'gpt-5.6-sol', displayName: 'Sol' }], fetchedAt: 789 },
    },
    appliedAccountId: 'a',
    decodeCredential: (value) => decoded.get(value) ?? value,
  });
  assert.equal(config.accounts[0].auth.kind, 'oAuth');
  assert.equal(config.accounts[0].auth.chatgptAccountId, 'acct-a');
  assert.deepEqual(config.accounts[0].availableModelIds, ['gpt-5.6-sol']);
  assert.equal(config.accounts[0].quotaWindows[0].remainingPercent, 75);
  assert.equal(config.accounts[0].quotaWindows[0].durationMinutes, 300);
  assert.equal(config.accounts[0].usageFetchedAt, 456);
  assert.equal(config.accounts[0].modelCatalogFetchedAt, 789);
  assert.equal(config.accounts[1].auth.kind, 'apiKey');
  assert.equal(config.pools[0].activatedAt, 123);
  assert.equal(config.appliedAccountId, 'a');
});
