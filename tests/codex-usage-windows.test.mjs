import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeCodexUsageWindows } = await import('../.test-build/codex-usage-windows.js');

const window = (usedPercent, minutes, resetAt = 1_800_000_000) => ({
  used_percent: usedPercent,
  limit_window_seconds: minutes * 60,
  reset_at: resetAt,
});

test('renders 5h and weekly windows from their actual durations', () => {
  const result = normalizeCodexUsageWindows({
    primary_window: window(25, 5 * 60),
    secondary_window: window(40, 7 * 24 * 60),
  });

  assert.deepEqual(result.map(({ kind, label, usedPercent }) => ({ kind, label, usedPercent })), [
    { kind: '5h', label: '5h limit', usedPercent: 25 },
    { kind: 'weekly', label: 'Weekly limit', usedPercent: 40 },
  ]);
});

test('does not fabricate a 5h window when the response only contains weekly quota', () => {
  const result = normalizeCodexUsageWindows({
    primary_window: window(61, 7 * 24 * 60),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'weekly');
  assert.equal(result[0].label, 'Weekly limit');
});

test('renders monthly-only quota without relying on the Free plan name', () => {
  const result = normalizeCodexUsageWindows({
    monthly_window: window(12, 30 * 24 * 60),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'monthly');
  assert.equal(result[0].label, 'Monthly limit');
});

test('automatically supports daily and annual windows and sorts shortest first', () => {
  const result = normalizeCodexUsageWindows({
    secondary_window: window(80, 365 * 24 * 60),
    primary_window: window(10, 24 * 60),
  });

  assert.deepEqual(result.map((item) => item.kind), ['daily', 'annual']);
  assert.deepEqual(result.map((item) => item.label), ['Daily limit', 'Annual limit']);
});

test('uses server duration fields when provided in minutes', () => {
  const result = normalizeCodexUsageWindows({
    primary_window: {
      used_percent: 7,
      window_duration_mins: 300,
      reset_at: 1_800_000_001,
    },
  });

  assert.equal(result[0].kind, '5h');
  assert.equal(result[0].durationMinutes, 300);
});

test('keeps an unknown real window as a generic Usage limit instead of guessing', () => {
  const result = normalizeCodexUsageWindows({
    primary_window: {
      used_percent: 33,
      reset_at: 1_800_000_002,
    },
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'unknown');
  assert.equal(result[0].label, 'Usage limit');
});

test('deduplicates explicit aliases that describe the same quota window', () => {
  const weekly = window(50, 7 * 24 * 60, 1_800_000_003);
  const result = normalizeCodexUsageWindows({
    secondary_window: weekly,
    weekly_window: { ...weekly },
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'weekly');
});
