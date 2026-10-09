import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getOverlayTooltipText,
  overlayBarTooltip,
} from "../../.test-build/common/overlay-tooltip.js";

const now = new Date(2026, 9, 8, 10, 0);
const at = (d, h, m) => new Date(2026, 9, d, h, m).toISOString();

test("single bar tooltip shows its reset", () => {
  const data = {
    provider: "codex",
    label: "Work",
    singleBars: [
      { label: "5H", percent: 40, resetAt: at(8, 14, 30) },
      { label: "WK", percent: 70, resetAt: null },
    ],
  };
  assert.equal(overlayBarTooltip(data, "single:0", now), "5 hrs usage limit - reset at 14:30");
  assert.equal(overlayBarTooltip(data, "single:1", now), "Weekly usage limit - ready now");
  assert.equal(overlayBarTooltip(data, "single:7", now), null);
});

test("family row tooltip is prefixed with the family", () => {
  const data = {
    provider: "antigravity",
    label: "Main",
    quotaRows: [
      {
        label: "Gemini",
        fiveHourPercent: 80,
        weeklyPercent: 60,
        fiveHourResetAt: at(9, 9, 0),
        weeklyDisabled: true,
      },
    ],
  };
  assert.equal(
    overlayBarTooltip(data, "row:0:five", now),
    "Gemini 5 hrs usage limit - reset at Tomorrow 09:00",
  );
  assert.equal(
    overlayBarTooltip(data, "row:0:weekly", now),
    "Gemini Weekly usage limit - disabled",
  );
});

test("fallback bars and the Claude context bar", () => {
  const claude = { provider: "claude", label: "C", fiveHourPercent: 50, weeklyResetAt: null };
  assert.equal(overlayBarTooltip(claude, "weekly", now), "Weekly usage limit - reset unavailable");
  const ctx = { provider: "claude", label: "C", singleBars: [{ label: "Ctx", percent: 30 }] };
  assert.equal(overlayBarTooltip(ctx, "single:0", now), "Context window remaining");
});

test("bar zone routes through getOverlayTooltipText", () => {
  const data = { provider: "codex", label: "W", singleBars: [{ label: "5H", percent: 1 }] };
  assert.equal(
    getOverlayTooltipText("bar:single:0", data, "PLUS"),
    "5 hrs usage limit - ready now",
  );
});

test("overlay bars expose their key and the bar zone is detected", () => {
  const card = readFileSync("src/components/overlay/OverlayCard.tsx", "utf8");
  const tooltip = readFileSync("src/utils/common/overlay-tooltip.ts", "utf8");
  assert.match(card, /data-bar-key=\{barKey\}/);
  assert.match(card, /barKey=\{`single:\$\{i\}`\}/);
  assert.match(card, /barKey=\{`row:\$\{rowIndex\}:five`\}/);
  assert.match(tooltip, /closest\("\[data-bar-key\]"\)/);
});
