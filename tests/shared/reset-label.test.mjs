import test from "node:test";
import assert from "node:assert/strict";
import {
  epochToIso,
  formatBarResetTooltip,
  formatCardResetLabel,
  longWindowLabel,
} from "../../.test-build/common/reset-label.js";

const now = new Date(2026, 9, 8, 10, 0);
const at = (d, h, m) => new Date(2026, 9, d, h, m).toISOString();

test("epochToIso accepts seconds and milliseconds and rejects junk", () => {
  const ms = new Date(2026, 9, 8, 14, 30).getTime();
  assert.equal(epochToIso(ms / 1000), new Date(ms).toISOString());
  assert.equal(epochToIso(ms), new Date(ms).toISOString());
  assert.equal(epochToIso(null), null);
  assert.equal(epochToIso(undefined), null);
  assert.equal(epochToIso(Number.NaN), null);
  assert.equal(epochToIso(0), null);
});

test("formatCardResetLabel matches the account card rules", () => {
  assert.equal(formatCardResetLabel("codex", at(8, 14, 30), false, now), "14:30");
  assert.equal(formatCardResetLabel("claude", at(9, 9, 0), false, now), "Tomorrow 09:00");
  assert.equal(formatCardResetLabel("antigravity", at(12, 9, 0), false, now), "Oct 12, 09:00");
  assert.equal(formatCardResetLabel("codex", null, false, now), "Ready");
  assert.equal(formatCardResetLabel("antigravity", undefined, false, now), "Ready");
  assert.equal(formatCardResetLabel("claude", null, false, now), "");
  assert.equal(formatCardResetLabel("claude", "not a date", false, now), "");
  assert.equal(formatCardResetLabel("antigravity", at(8, 14, 30), true, now), "Disabled");
});

test("longWindowLabel expands overlay short labels", () => {
  assert.equal(longWindowLabel("5H"), "5 hrs");
  assert.equal(longWindowLabel("wk"), "Weekly");
  assert.equal(longWindowLabel("MO"), "Monthly");
  assert.equal(longWindowLabel("Daily"), "Daily");
});

test("formatBarResetTooltip reuses the card bar sentence", () => {
  assert.equal(
    formatBarResetTooltip("codex", "5H", at(8, 14, 30), false, null, now),
    "5 hrs usage limit - reset at 14:30",
  );
  assert.equal(
    formatBarResetTooltip("antigravity", "WK", at(9, 9, 0), false, "Gemini", now),
    "Gemini Weekly usage limit - reset at Tomorrow 09:00",
  );
  assert.equal(
    formatBarResetTooltip("codex", "5H", null, false, null, now),
    "5 hrs usage limit - ready now",
  );
  assert.equal(
    formatBarResetTooltip("claude", "WK", null, false, null, now),
    "Weekly usage limit - reset unavailable",
  );
  assert.equal(
    formatBarResetTooltip("antigravity", "5H", null, true, "Claude", now),
    "Claude 5 hrs usage limit - disabled",
  );
});
