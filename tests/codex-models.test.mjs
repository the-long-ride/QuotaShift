import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CODEX_MODEL_CACHE_TTL_MS,
  buildCodexTierModelGroups,
  isCodexModelCacheFresh,
  normalizeCodexModelCatalog,
  validateCodexPoolModel,
} from '../.test-build/codex-models.js';

const now = 2_000_000_000_000;
const oauthAccounts = [
  { id: 'plus-a', label: 'Plus A', apiKey: 'x', lastPlan: 'ChatGPT Plus', email: 'a@example.com' },
  { id: 'plus-b', label: 'Plus B', apiKey: 'x', lastPlan: 'ChatGPT Plus', email: 'b@example.com' },
  { id: 'free-a', label: 'Free A', apiKey: 'x', lastPlan: 'ChatGPT Free', email: 'f@example.com' },
];

const catalogCache = {
  'plus-a': {
    accountId: 'plus-a',
    planName: 'ChatGPT Plus',
    fetchedAt: now - 1000,
    models: [
      { id: 'gpt-5.6-terra', displayName: 'GPT-5.6 Terra' },
      { id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol' },
    ],
  },
  'plus-b': {
    accountId: 'plus-b',
    planName: 'ChatGPT Plus',
    fetchedAt: now - 2000,
    models: [
      { id: 'gpt-5.6-terra', displayName: 'GPT-5.6 Terra' },
    ],
  },
  'free-a': {
    accountId: 'free-a',
    planName: 'ChatGPT Free',
    fetchedAt: now - 3000,
    models: [
      { id: 'gpt-5.6-luna', displayName: 'GPT-5.6 Luna' },
    ],
  },
};

test('normalizes account model catalog and de-duplicates canonical identifiers', () => {
  const normalized = normalizeCodexModelCatalog({
    models: [
      { slug: ' gpt-5.6-terra ', display_name: 'GPT-5.6 Terra', visibility: 'list', supported_in_api: true },
      { id: 'gpt-5.6-terra', display_name: 'Duplicate' },
      { model: 'gpt-5.6-sol' },
      { id: '   ' },
      null,
    ],
  });

  assert.deepEqual(normalized, [
    {
      id: 'gpt-5.6-terra',
      displayName: 'GPT-5.6 Terra',
      visibility: 'list',
      supportedInApi: true,
    },
    {
      id: 'gpt-5.6-sol',
      displayName: 'gpt-5.6-sol',
      visibility: null,
      supportedInApi: null,
    },
  ]);
});

test('accepts direct arrays and data arrays returned by compatible catalog endpoints', () => {
  assert.deepEqual(
    normalizeCodexModelCatalog([{ id: 'model-a' }]).map((item) => item.id),
    ['model-a'],
  );
  assert.deepEqual(
    normalizeCodexModelCatalog({ data: [{ model: 'model-b' }] }).map((item) => item.id),
    ['model-b'],
  );
});

test('model cache is fresh for 24 hours exactly and failed entries are stale', () => {
  const entry = catalogCache['plus-a'];
  assert.equal(CODEX_MODEL_CACHE_TTL_MS, 24 * 60 * 60 * 1000);
  assert.equal(isCodexModelCacheFresh({ ...entry, fetchedAt: now - CODEX_MODEL_CACHE_TTL_MS + 1 }, now), true);
  assert.equal(isCodexModelCacheFresh({ ...entry, fetchedAt: now - CODEX_MODEL_CACHE_TTL_MS }, now), false);
  assert.equal(isCodexModelCacheFresh({ ...entry, error: 'temporary failure' }, now), false);
});

test('groups models by account tier with support counts and intersections', () => {
  const groups = buildCodexTierModelGroups(oauthAccounts, catalogCache, now);
  const plus = groups.find((group) => group.tier === 'Plus');
  const free = groups.find((group) => group.tier === 'Free');

  assert.ok(plus);
  assert.equal(plus.accountCount, 2);
  assert.equal(plus.scannedCount, 2);
  assert.equal(plus.failedCount, 0);
  assert.deepEqual(
    plus.models.map((item) => [item.model.id, item.supportCount, item.supportedByAll]),
    [
      ['gpt-5.6-sol', 1, false],
      ['gpt-5.6-terra', 2, true],
    ],
  );
  assert.equal(free?.models[0]?.model.id, 'gpt-5.6-luna');
});

test('strict discovered model blocks every selected account that cannot confirm support', () => {
  const validation = validateCodexPoolModel(
    'gpt-5.6-sol',
    'discovered',
    ['plus-a', 'plus-b'],
    oauthAccounts,
    catalogCache,
    now,
  );

  assert.equal(validation.canSave, false);
  assert.equal(validation.warning, false);
  assert.deepEqual(validation.incompatibleAccountIds, ['plus-b']);
  assert.match(validation.reasons['plus-b'], /not available/i);
});

test('strict discovered model blocks stale, failed, missing, and API-key catalog state', () => {
  const apiAccount = { id: 'api-a', label: 'API A', apiKey: 'sk-obfuscated' };
  const stale = {
    ...catalogCache,
    'plus-b': { ...catalogCache['plus-b'], fetchedAt: now - CODEX_MODEL_CACHE_TTL_MS },
  };
  const validation = validateCodexPoolModel(
    'gpt-5.6-terra',
    'discovered',
    ['plus-a', 'plus-b', 'api-a'],
    [...oauthAccounts, apiAccount],
    stale,
    now,
  );

  assert.equal(validation.canSave, false);
  assert.deepEqual(validation.incompatibleAccountIds.sort(), ['api-a', 'plus-b']);
  assert.match(validation.reasons['plus-b'], /scan|stale/i);
  assert.match(validation.reasons['api-a'], /catalog|api key|unverified/i);
});

test('manual model remains saveable but warns for unconfirmed members', () => {
  const validation = validateCodexPoolModel(
    'future-model-user-entered',
    'manual',
    ['plus-a', 'plus-b'],
    oauthAccounts,
    catalogCache,
    now,
  );

  assert.equal(validation.canSave, true);
  assert.equal(validation.warning, true);
  assert.deepEqual(validation.incompatibleAccountIds, ['plus-a', 'plus-b']);
});
