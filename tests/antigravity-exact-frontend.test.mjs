import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildExactRequest,
  mergeExactResult,
  loadPersistentWorkerPreference,
  PERSISTENT_WORKER_KEY,
} from '../.test-build/antigravity-exact.js'

test('serializes a monitored account without persisting plaintext credentials', () => {
  const request = buildExactRequest({
    id: 'ag-1', label: 'A', token: 'encoded-access', refreshToken: 'encoded-refresh',
    profileUrl: 'encoded-profile', email: 'User@example.com', authMethod: 'consumer',
  }, value => `decoded:${value}`)
  assert.deepEqual(request, {
    accountId: 'ag-1', email: 'User@example.com', accessToken: 'decoded:encoded-access',
    refreshToken: 'decoded:encoded-refresh', profileUrl: 'decoded:encoded-profile', authMethod: 'consumer',
  })
})

test('requires email and access token for exact identity verification', () => {
  assert.equal(buildExactRequest({ id: '1', label: 'x', token: 't' }, value => value), null)
  assert.equal(buildExactRequest({ id: '1', label: 'x', token: '', email: 'x@y.com' }, value => value), null)
})

test('exact result replaces quota while error retains last exact cache', () => {
  const previous = { quotas: [{ model: 'Gemini Models', percent: 20, refreshTime: 'Ready' }], source: 'exact', fetchedAt: 10 }
  const exact = mergeExactResult(previous, {
    accountId: '1', state: 'exact', fetchedAt: '2026-01-01T00:00:00Z', error: null,
    status: { online: true, email: 'x@y.com', planTier: 'Paid', credits: null, recentlyUsedModel: null, monitoredCodex: null,
      quotas: [{ model: 'Gemini Models', percent: 80, refreshTime: 'Ready', fiveHourPercent: 80, weeklyPercent: 50 }] },
  }, 100)
  assert.equal(exact.quotas[0].weeklyPercent, 50)
  assert.equal(exact.source, 'exact')
  const failed = mergeExactResult(exact, { accountId: '1', state: 'error', fetchedAt: 'x', status: null, error: 'failed' }, 200)
  assert.equal(failed.quotas[0].weeklyPercent, 50)
  assert.equal(failed.source, 'cached_exact')
  assert.equal(failed.error, 'failed')
})

test('persistent workers are disabled by default', () => {
  const storage = { getItem: () => null }
  assert.equal(loadPersistentWorkerPreference(storage), false)
  assert.equal(PERSISTENT_WORKER_KEY, 'quotashift_antigravity_persistent_workers_v1')
})
