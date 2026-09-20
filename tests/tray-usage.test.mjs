import test from "node:test";
import assert from "node:assert/strict";

import { buildMonitoredTrayInfo } from "../.test-build/common/tray-usage.js";

test("tray payload strips account identity and keeps Claude usage bars", () => {
  const info = buildMonitoredTrayInfo({
    provider: "claude",
    label: "Work Profile",
    email: "person@example.com",
    fiveHourPercent: 81,
    weeklyPercent: 63,
  });

  assert.deepEqual(info, {
    provider: "claude",
    singleBars: [
      { label: "5H", percent: 81 },
      { label: "WK", percent: 63 },
    ],
    quotaRows: [],
  });
  assert.equal("label" in info, false);
  assert.equal("email" in info, false);
});

test("tray payload preserves grouped Antigravity quota rows without adding fallback bars", () => {
  const quotaRows = [
    { label: "Gemini", fiveHourPercent: 100, weeklyPercent: 83 },
    { label: "Claude", fiveHourPercent: 72, weeklyPercent: 61 },
  ];

  const info = buildMonitoredTrayInfo({
    provider: "antigravity",
    label: "Account label",
    email: "person@example.com",
    fiveHourPercent: 100,
    weeklyPercent: 83,
    quotaRows,
  });

  assert.deepEqual(info, {
    provider: "antigravity",
    singleBars: [],
    quotaRows,
  });
});
