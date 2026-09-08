import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAbsoluteTime } from '../src/utils/format-time.ts';

test('formatAbsoluteTime returns Ready or Exhausted directly', () => {
  assert.equal(formatAbsoluteTime('Ready'), 'Ready');
  assert.equal(formatAbsoluteTime('Exhausted'), 'Exhausted');
  assert.equal(formatAbsoluteTime(''), '—');
  assert.equal(formatAbsoluteTime('not-a-date'), '—');
});

test('formatAbsoluteTime formats same day as Resets at: {timeStr}', () => {
  const now = new Date(2026, 8, 9, 8, 30);
  const resetToday = new Date(2026, 8, 9, 18, 6).toISOString();

  assert.equal(formatAbsoluteTime(resetToday, now), 'Resets at: 6:06 PM');
});

test('formatAbsoluteTime formats tomorrow as Tomorrow at {hour and minute}', () => {
  const now = new Date(2026, 8, 9, 23, 0);
  const resetTomorrow = new Date(2026, 8, 10, 6, 6).toISOString();

  assert.equal(formatAbsoluteTime(resetTomorrow, now), 'Tomorrow at 6:06 AM');
});

test('formatAbsoluteTime formats tomorrow across month boundaries', () => {
  const endOfMonth = new Date(2026, 0, 31, 22, 0);
  const nextDay = new Date(2026, 1, 1, 9, 15).toISOString();

  assert.equal(formatAbsoluteTime(nextDay, endOfMonth), 'Tomorrow at 9:15 AM');
});

test('formatAbsoluteTime formats tomorrow across year boundaries', () => {
  const endOfYear = new Date(2026, 11, 31, 23, 30);
  const nextYear = new Date(2027, 0, 1, 8, 0).toISOString();

  assert.equal(formatAbsoluteTime(nextYear, endOfYear), 'Tomorrow at 8:00 AM');
});

test('formatAbsoluteTime formats subsequent days with short month abbreviations', () => {
  const now = new Date(2026, 8, 9, 10, 0);
  const resetLater = new Date(2026, 8, 14, 19, 0).toISOString();

  assert.equal(formatAbsoluteTime(resetLater, now), 'Resets at: Sep 14, 7:00 PM');
});

test('formatAbsoluteTime uses standard 3-letter month abbreviations', () => {
  const now = new Date(2026, 0, 1, 0, 0);
  const dates = [
    { date: new Date(2026, 0, 15, 12, 0), expected: 'Resets at: Jan 15, 12:00 PM' },
    { date: new Date(2026, 1, 15, 12, 0), expected: 'Resets at: Feb 15, 12:00 PM' },
    { date: new Date(2026, 2, 15, 12, 0), expected: 'Resets at: Mar 15, 12:00 PM' },
    { date: new Date(2026, 3, 15, 12, 0), expected: 'Resets at: Apr 15, 12:00 PM' },
    { date: new Date(2026, 4, 15, 12, 0), expected: 'Resets at: May 15, 12:00 PM' },
    { date: new Date(2026, 5, 15, 12, 0), expected: 'Resets at: Jun 15, 12:00 PM' },
    { date: new Date(2026, 6, 15, 12, 0), expected: 'Resets at: Jul 15, 12:00 PM' },
    { date: new Date(2026, 7, 15, 12, 0), expected: 'Resets at: Aug 15, 12:00 PM' },
    { date: new Date(2026, 8, 15, 12, 0), expected: 'Resets at: Sep 15, 12:00 PM' },
    { date: new Date(2026, 9, 15, 12, 0), expected: 'Resets at: Oct 15, 12:00 PM' },
    { date: new Date(2026, 10, 15, 12, 0), expected: 'Resets at: Nov 15, 12:00 PM' },
    { date: new Date(2026, 11, 15, 12, 0), expected: 'Resets at: Dec 15, 12:00 PM' },
  ];

  for (const { date, expected } of dates) {
    assert.equal(formatAbsoluteTime(date.toISOString(), now), expected);
  }
});
