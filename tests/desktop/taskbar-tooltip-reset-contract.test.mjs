import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const card = readFileSync("src/components/taskbar/TaskbarTooltipCard.tsx", "utf8");
const css = readFileSync("src/styles/desktop/taskbar-tooltip.css", "utf8");

test("hover card renders a divider and reset cell per meter", () => {
  assert.match(card, /formatCardResetLabel\(details\.provider, meter\.resetAt, meter\.disabled\)/);
  assert.match(card, /className="taskbar-tooltip-meters"/);
  assert.match(card, /className="taskbar-tooltip-divider"/);
  assert.match(card, /className="taskbar-tooltip-reset"/);
});

test("all meters of one card share one grid so bars align", () => {
  assert.match(
    css,
    /\.taskbar-tooltip-meters\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\) auto 1px auto;/,
  );
  assert.match(css, /\.taskbar-tooltip-meter\s*\{[\s\S]*?display:\s*contents;/);
  assert.match(css, /\.taskbar-tooltip-reset\s*\{[\s\S]*?text-align:\s*right;/);
  assert.match(css, /\.taskbar-tooltip-section-title\s*\{[\s\S]*?grid-column:\s*1 \/ -1;/);
});
