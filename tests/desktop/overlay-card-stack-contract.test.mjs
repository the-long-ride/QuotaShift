import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("overlay renders every tracked account as a stacked card", () => {
  const app = read("src/components/overlay/OverlayApp.tsx");
  const stack = read("src/components/overlay/OverlayCardStack.tsx");
  assert.match(app, /listOverlayAccounts\(data\)/);
  assert.match(app, /<OverlayCardStack[\s\S]*cards=\{cards\}/);
  assert.match(app, /additionalAccounts\?: OverlayAccountData\[\]/);
  assert.match(stack, /cards\.map\(/);
  assert.match(stack, /data-overlay-card-index/);
  assert.match(stack, /showTooltip=\{showTooltip && index === activeIndex\}/);
});

test("tooltip follows the hovered card, not always the primary", () => {
  const app = read("src/components/overlay/OverlayApp.tsx");
  assert.match(app, /resolveHoveredCardIndex\(event\.target as HTMLElement, cards\.length\)/);
  assert.match(app, /getOverlayTooltipText\(activeTooltipZone, tooltipData, tierText\)/);
});

test("sizing bridge measures the whole card stack", () => {
  const bridge = read("src/components/overlay/OverlayWindowSizingBridge.tsx");
  const css = read("src/styles/desktop/ui-adjustment.css");
  assert.match(bridge, /\.overlay-container \.overlay-cards/);
  assert.match(bridge, /rows: document\.querySelectorAll\(CARD_SELECTOR\)\.length/);
  assert.match(
    css,
    /\.overlay-cards\s*\{[^}]*flex-direction:\s*column[^}]*width:\s*max-content[^}]*height:\s*max-content/,
  );
});
