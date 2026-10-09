import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskbarColumns } from "../../.test-build/common/taskbar-columns.js";

const iso = "2026-10-08T07:30:00.000Z";

test("single bars keep their reset time", () => {
  const [col] = buildTaskbarColumns({
    provider: "codex",
    label: "Work",
    singleBars: [{ label: "5H", percent: 40, resetAt: iso }],
  });
  assert.deepEqual(col.details.sections[0].meters[0], {
    label: "5H",
    percent: 40,
    resetAt: iso,
    disabled: false,
  });
});

test("family rows keep reset and disabled flags", () => {
  const [col] = buildTaskbarColumns({
    provider: "antigravity",
    label: "Main",
    quotaRows: [
      {
        label: "Gemini",
        fiveHourPercent: 80,
        weeklyPercent: 60,
        fiveHourResetAt: iso,
        weeklyResetAt: null,
        weeklyDisabled: true,
      },
    ],
  });
  const [five, weekly] = col.details.sections[0].meters;
  assert.equal(five.resetAt, iso);
  assert.equal(five.disabled, false);
  assert.equal(weekly.resetAt, null);
  assert.equal(weekly.disabled, true);
});

test("fallback meters read the top-level reset fields", () => {
  const [col] = buildTaskbarColumns({
    provider: "claude",
    label: "Claude",
    fiveHourPercent: 50,
    weeklyPercent: 70,
    fiveHourResetAt: iso,
  });
  const [five, weekly] = col.details.sections[0].meters;
  assert.equal(five.resetAt, iso);
  assert.equal(weekly.resetAt, null);
});
