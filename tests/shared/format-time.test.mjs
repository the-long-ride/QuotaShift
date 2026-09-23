import test from "node:test";
import assert from "node:assert/strict";
import {
  formatAbsoluteTime,
  formatUsageLimitTooltip,
} from "../../.test-build/common/format-time.js";

test("formatAbsoluteTime returns Ready or Exhausted directly", () => {
  assert.equal(formatAbsoluteTime("Ready"), "Ready");
  assert.equal(formatAbsoluteTime("Exhausted"), "Exhausted");
  assert.equal(formatAbsoluteTime(""), "—");
  assert.equal(formatAbsoluteTime("not-a-date"), "—");
});

test("formatAbsoluteTime uses compact local 24-hour HH:mm for today", () => {
  const now = new Date(2026, 8, 9, 8, 30);
  const resetToday = new Date(2026, 8, 9, 18, 6).toISOString();
  assert.equal(formatAbsoluteTime(resetToday, now), "18:06");
});

test("formatAbsoluteTime keeps Tomorrow and uses HH:mm", () => {
  const now = new Date(2026, 8, 9, 23, 0);
  const resetTomorrow = new Date(2026, 8, 10, 6, 6).toISOString();
  assert.equal(formatAbsoluteTime(resetTomorrow, now), "Tomorrow 06:06");
});

test("formatAbsoluteTime handles tomorrow across month/year boundaries", () => {
  const endOfMonth = new Date(2026, 0, 31, 22, 0);
  const nextDay = new Date(2026, 1, 1, 9, 15).toISOString();
  assert.equal(formatAbsoluteTime(nextDay, endOfMonth), "Tomorrow 09:15");

  const endOfYear = new Date(2026, 11, 31, 23, 30);
  const nextYear = new Date(2027, 0, 1, 8, 0).toISOString();
  assert.equal(formatAbsoluteTime(nextYear, endOfYear), "Tomorrow 08:00");
});

test("formatAbsoluteTime formats later dates as MMM D, HH:mm", () => {
  const now = new Date(2026, 8, 9, 10, 0);
  const resetLater = new Date(2026, 8, 14, 19, 0).toISOString();
  assert.equal(formatAbsoluteTime(resetLater, now), "Sep 14, 19:00");
});

test("formatUsageLimitTooltip expands the compact label and reset text", () => {
  assert.equal(
    formatUsageLimitTooltip("5 hrs", "Sep 21, 18:30"),
    "5 hrs usage limit - reset at Sep 21, 18:30",
  );
  assert.equal(formatUsageLimitTooltip("Weekly", "Ready"), "Weekly usage limit - ready now");
  assert.equal(
    formatUsageLimitTooltip("Monthly", "Unavailable"),
    "Monthly usage limit - reset unavailable",
  );
});
