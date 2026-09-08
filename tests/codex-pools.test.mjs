import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCodexPoolCapacity,
  findCodexPoolFailover,
  normalizeCodexPools,
  pickBestCodexPoolMember,
  reconcileCodexPools,
} from '../.test-build/codex-pools.js';

const accounts = [
  { id: 'oauth-a', label: 'OAuth A', apiKey: 'x' },
  { id: 'oauth-b', label: 'OAuth B', apiKey: 'x' },
  { id: 'api-c', label: 'API C', apiKey: 'x' },
];

const pool = {
  id: 'pool-sol',
  name: 'Sol Pool',
  model: 'gpt-5.6-sol',
  accountIds: accounts.map((account) => account.id),
  autoSwitch: true,
};

const cache = {
  'oauth-a': {
    isOAuth: true,
    fetchedAt: Date.now(),
    primary: { used_percent: 60, reset_at: 1_900_000_000 },
    secondary: { used_percent: 20, reset_at: 1_900_500_000 },
  },
  'oauth-b': {
    isOAuth: true,
    fetchedAt: Date.now(),
    primary: { used_percent: 20, reset_at: 1_900_100_000 },
  },
  'api-c': {
    isOAuth: false,
    fetchedAt: Date.now(),
    snapshot: {
      hardLimit: 100,
      softLimit: 0,
      models: [{ costUsd: 1 }],
    },
  },
};

test('aggregates known OAuth capacity as additive percentage-points', () => {
  const aggregate = aggregateCodexPoolCapacity(pool, accounts, cache);

  assert.deepEqual(aggregate.primary, {
    remainingPoints: 120,
    capacityPoints: 200,
    knownMembers: 2,
    totalMembers: 3,
    nextResetAt: null,
  });
  assert.deepEqual(aggregate.secondary, {
    remainingPoints: 80,
    capacityPoints: 100,
    knownMembers: 1,
    totalMembers: 3,
    nextResetAt: null,
  });
  assert.equal(aggregate.oauthMembers, 2);
  assert.equal(aggregate.apiKeyMembers, 1);
});

test('does not fabricate capacity for missing or error members', () => {
  const withMissing = {
    ...pool,
    accountIds: [...pool.accountIds, 'missing-account'],
  };
  const withErrorCache = {
    ...cache,
    'oauth-b': { isOAuth: true, error: 'offline' },
  };

  const aggregate = aggregateCodexPoolCapacity(withMissing, accounts, withErrorCache);
  assert.equal(aggregate.primary.remainingPoints, 40);
  assert.equal(aggregate.primary.capacityPoints, 100);
  assert.equal(aggregate.primary.knownMembers, 1);
  assert.equal(aggregate.primary.totalMembers, 4);
  assert.equal(aggregate.secondary.remainingPoints, 80);
  assert.equal(aggregate.secondary.capacityPoints, 100);
});

test('prefers healthy OAuth members even when an API-key member scores higher', () => {
  const best = pickBestCodexPoolMember(pool, accounts, cache);
  assert.equal(best?.account.id, 'oauth-b');
  assert.equal(Math.round(best?.score ?? 0), 80);
});

test('uses API-key members only when no healthy OAuth candidate exists', () => {
  const apiOnlyPool = { ...pool, accountIds: ['api-c'] };
  const best = pickBestCodexPoolMember(apiOnlyPool, accounts, cache);
  assert.equal(best?.account.id, 'api-c');
});

test('finds failover only when the current pool member is exhausted or unusable', () => {
  assert.equal(findCodexPoolFailover(pool, 'oauth-a', accounts, cache), null);

  const exhaustedCache = {
    ...cache,
    'oauth-a': {
      ...cache['oauth-a'],
      primary: { used_percent: 100, reset_at: 1_900_000_000 },
    },
  };
  const decision = findCodexPoolFailover(pool, 'oauth-a', accounts, exhaustedCache);
  assert.equal(decision?.account.id, 'oauth-b');
});

test('reconciles deleted account ids without deleting an empty pool', () => {
  const reconciled = reconcileCodexPools([
    pool,
    { ...pool, id: 'empty', accountIds: ['deleted-only'] },
  ], accounts);

  assert.deepEqual(reconciled[0].accountIds, ['oauth-a', 'oauth-b', 'api-c']);
  assert.deepEqual(reconciled[1].accountIds, []);
});

test('normalization rejects blank model strings and de-duplicates member ids', () => {
  const normalized = normalizeCodexPools([
    { ...pool, accountIds: ['oauth-a', 'oauth-a', 'oauth-b'] },
    { ...pool, id: 'bad', model: '   ' },
  ]);

  assert.equal(normalized.length, 1);
  assert.deepEqual(normalized[0].accountIds, ['oauth-a', 'oauth-b']);
});

test('normalization preserves model selection metadata and defaults legacy pools to manual', () => {
  const [legacy, discovered] = normalizeCodexPools([
    pool,
    { ...pool, id: 'pool-discovered', modelSelectionMode: 'discovered', activatedAt: 2_000_000_000_000 },
  ]);

  assert.equal(legacy.modelSelectionMode, 'manual');
  assert.equal(legacy.activatedAt, undefined);
  assert.equal(discovered.modelSelectionMode, 'discovered');
  assert.equal(discovered.activatedAt, 2_000_000_000_000);
});

test('normalization rejects invalid selection metadata without corrupting the pool', () => {
  const [normalized] = normalizeCodexPools([
    { ...pool, modelSelectionMode: 'anything-else', activatedAt: Number.NaN },
  ]);

  assert.equal(normalized.modelSelectionMode, 'manual');
  assert.equal(normalized.activatedAt, undefined);
});

test('reports the earliest reset only for exhausted known members', () => {
  const exhaustedCache = {
    ...cache,
    'oauth-a': {
      ...cache['oauth-a'],
      primary: { used_percent: 100, reset_at: 1_900_000_000 },
    },
    'oauth-b': {
      ...cache['oauth-b'],
      primary: { used_percent: 100, reset_at: 1_899_000_000 },
    },
  };
  const aggregate = aggregateCodexPoolCapacity(pool, accounts, exhaustedCache);
  assert.equal(aggregate.primary.nextResetAt, 1_899_000_000);
});
