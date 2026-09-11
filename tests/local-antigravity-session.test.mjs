import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyLocalAntigravitySession,
  mergeLocalAntigravityStatus,
  canAddLocalSessionToMonitored,
} from '../.test-build/local-antigravity-session.js';

test('offline refresh retains the last captured identity and quota', () => {
  const previous = {
    ...createEmptyLocalAntigravitySession(),
    email: 'User@Example.com',
    planTier: 'Google AI Pro',
    quotas: [{ model: 'Gemini Models', percent: 50, refreshTime: 'Ready', weeklyPercent: 42 }],
    online: true,
    lastSeenAt: 1000,
  };
  const result = mergeLocalAntigravityStatus(previous, { online: false });
  assert.equal(result.online, false);
  assert.equal(result.email, 'User@Example.com');
  assert.equal(result.quotas[0].weeklyPercent, 42);
  assert.equal(result.lastSeenAt, 1000);
});

test('successful local refresh updates identity but preserves captured credentials', () => {
  const previous = {
    ...createEmptyLocalAntigravitySession(),
    capturedAccount: { token: 'obf', email: 'old@example.com', authMethod: 'consumer' },
  };
  const result = mergeLocalAntigravityStatus(previous, {
    online: true,
    email: 'new@example.com',
    planTier: 'Paid',
    quotas: [],
    credits: null,
    monitoredCodex: null,
    recentlyUsedModel: null,
  }, 1234);
  assert.equal(result.email, 'new@example.com');
  assert.equal(result.lastSeenAt, 1234);
  assert.equal(result.capturedAccount?.token, 'obf');
});

test('add button is hidden for a case-insensitive monitored duplicate', () => {
  const session = {
    ...createEmptyLocalAntigravitySession(),
    email: 'USER@example.com',
    capturedAccount: { token: 'obf', email: 'USER@example.com' },
  };
  assert.equal(canAddLocalSessionToMonitored(session, [{ id: '1', label: 'x', token: 'x', email: ' user@EXAMPLE.com ' }]), false);
  assert.equal(canAddLocalSessionToMonitored(session, []), true);
});

test('add button requires both an email and captured token', () => {
  const empty = createEmptyLocalAntigravitySession();
  assert.equal(canAddLocalSessionToMonitored(empty, []), false);
  assert.equal(canAddLocalSessionToMonitored({ ...empty, email: 'x@y.com' }, []), false);
});
