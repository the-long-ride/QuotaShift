import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const settings = read("src/components/common/SettingsModal.tsx");
const uiAdjustmentCss = read("src/styles/desktop/ui-adjustment.css");
const uiPolish = read("src/styles/desktop/ui-polish.css");
const refreshSvg = read("assets/icons/refresh.svg");
const importSvg = read("assets/icons/import.svg");
const exportSvg = read("assets/icons/export.svg");

test("shared refresh artwork uses the approved dual-arrow SVG", () => {
  assert.match(refreshSvg, /M12\.0789 3V2\.25V3/);
  assert.match(refreshSvg, /M11\.8825 21V21\.75V21/);
  assert.match(uiPolish, /\.refresh-icon[\s\S]*refresh\.svg/);
});

test("account refresh controls render the shared refresh artwork", () => {
  assert.match(uiPolish, /\.codex-card-refresh-btn::before[\s\S]*refresh\.svg/);
});

test("Data import and export buttons use the approved artwork", () => {
  assert.match(settings, /Export Backup/);
  assert.match(settings, /Import Backup/);
  assert.match(exportSvg, /M12 5L11\.6464 4\.64645/);
  assert.match(importSvg, /M12 14L11\.6464 14\.3536/);
  assert.match(uiPolish, /export\.svg/);
  assert.match(uiPolish, /import\.svg/);
});

test("overlay surface is clipped to its own viewport and the card is not capped by it", () => {
  assert.match(uiAdjustmentCss, /\.overlay-container\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(uiAdjustmentCss, /\.glass-card\s*\{[^}]*max-width:\s*none/);
  assert.match(uiAdjustmentCss, /\.glass-card\s*\{[^}]*max-height:\s*none/);
  assert.doesNotMatch(uiPolish, /\.glass-card\s*\{[^}]*max-height:\s*100%/);
  assert.match(uiPolish, /\.glass-card\s*\{[\s\S]*overflow:\s*hidden/);
});

test("header logo artwork visually fills more of its frame", () => {
  assert.match(uiPolish, /\.logo-icon\s*\{[\s\S]*transform:\s*scale\(1\.2\)/);
});
