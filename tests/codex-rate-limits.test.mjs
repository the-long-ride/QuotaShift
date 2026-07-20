import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodexRateLimits } from '../.test-build/codex-rate-limits.js';

const session = (used = 12) => ({
  used_percent: used,
  limit_window_seconds: 18_000,
  reset_at: 1_800_000_000,
});

const weekly = (used = 34) => ({
  used_percent: used,
  limit_window_seconds: 604_800,
  reset_at: 1_800_500_000,
});

const monthly = (used = 56) => ({
  used_percent: used,
  limit_window_seconds: 2_592_000,
  reset_at: 1_802_000_000,
});

test('maps the normal wham primary and secondary windows', () => {
  const result = normalizeCodexRateLimits({
    rate_limit: {
      primary_window: session(),
      secondary_window: weekly(),
    },
  }, 'plus');

  assert.equal(result.primary?.used_percent, 12);
  assert.equal(result.secondary?.used_percent, 34);
  assert.equal(result.monthly, null);
});

test('recognizes a weekly-only primary window by its seven-day duration', () => {
  const result = normalizeCodexRateLimits({
    rate_limit: {
      primary_window: weekly(41),
    },
  }, 'free');

  assert.equal(result.primary, null);
  assert.equal(result.secondary?.used_percent, 41);
  assert.equal(result.monthly, null);
});

test('recognizes CLI-style primary and secondary aliases using window_minutes', () => {
  const result = normalizeCodexRateLimits({
    rate_limits: {
      primary: { used_percent: 22, window_minutes: 300 },
      secondary: { used_percent: 63, window_minutes: 10_080 },
    },
  }, 'plus');

  assert.equal(result.primary?.used_percent, 22);
  assert.equal(result.secondary?.used_percent, 63);
});

test('recognizes explicit weekly and monthly aliases', () => {
  const result = normalizeCodexRateLimits({
    rate_limit: {
      weekly_window: weekly(28),
      monthly_window: monthly(72),
    },
  }, 'free');

  assert.equal(result.secondary?.used_percent, 28);
  assert.equal(result.monthly?.used_percent, 72);
});

test('keeps unknown-duration primary and secondary fields as compatible fallbacks', () => {
  const primary = { used_percent: 11, reset_at: 1_800_000_000 };
  const secondary = { used_percent: 44, reset_at: 1_800_500_000 };
  const result = normalizeCodexRateLimits({
    rate_limit: { primary_window: primary, secondary_window: secondary },
  }, 'plus');

  assert.deepEqual(result.primary, primary);
  assert.deepEqual(result.secondary, secondary);
});

test('uses the most conservative duplicate window value', () => {
  const result = normalizeCodexRateLimits({
    rate_limit: {
      secondary_window: weekly(20),
      weekly_window: weekly(65),
    },
  }, 'plus');

  assert.equal(result.secondary?.used_percent, 65);
});

test('uses explicit period metadata when duration is absent', () => {
  const result = normalizeCodexRateLimits({
    rate_limit: {
      primary_window: { used_percent: 37, window_type: 'weekly' },
    },
  }, 'plus');

  assert.equal(result.primary, null);
  assert.equal(result.secondary?.used_percent, 37);
});
