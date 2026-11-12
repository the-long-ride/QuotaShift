import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("every settings segmented selector supplies its active index", () => {
  for (const path of [
    "src/components/common/settings-fields/CardViewSetting.tsx",
    "src/components/common/settings-fields/QuotaPercentModeSetting.tsx",
    "src/components/common/accounts/QuotaDisplayRow.tsx",
    "src/components/common/settings-fields/OverlayAdjustmentGroup.tsx",
  ]) {
    const component = read(path);
    assert.match(component, /data-segments=/, path);
    assert.match(component, /data-active-index=/, path);
    assert.doesNotMatch(component, /--segment-index/, path);
  }
});

test("indicator supports two and three options with visible selected text", () => {
  const css = read("src/styles/settings/settings-segment-motion.css");
  assert.match(css, /data-segments="3"\]\[data-active-index="2"/);
  assert.match(css, /settings-segmented-switch > \.settings-segment-btn--active/);
  assert.match(css, /font-size: 9\.5px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /\* var\(--segment-index/);
});
