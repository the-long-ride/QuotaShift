import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const uiAdjustment = read("src/utils/common/ui-adjustment.ts");
const uiPolish = read("src/styles/desktop/ui-polish.css");
const baseCss = read("src/styles/shared/base.css");
const header = read("src/components/common/Header.tsx");
const styles = read("src/styles.css");
const refreshSvg = read("assets/icons/refresh.svg");
const importSvg = read("assets/icons/import.svg");
const exportSvg = read("assets/icons/export.svg");

test("overlay keeps the fixed 340x80 base height while whole-surface scale owns native size", () => {
  assert.match(uiAdjustment, /OVERLAY_BASE_WIDTH\s*=\s*340/);
  assert.match(uiAdjustment, /OVERLAY_BASE_HEIGHT\s*=\s*80/);
  assert.match(uiPolish, /\.overlay-container[\s\S]*overflow:\s*hidden/);
  assert.match(uiPolish, /\.glass-card::before[\s\S]*height:\s*38%/);
});

test("shared refresh artwork is applied to header and account refresh controls", () => {
  assert.match(refreshSvg, /M12\.0789 3V2\.25V3/);
  assert.match(refreshSvg, /M11\.8825 21V21\.75V21/);
  assert.match(uiPolish, /\.refresh-icon/);
  assert.match(uiPolish, /\.codex-card-refresh-btn/);
  assert.match(uiPolish, /refresh\.svg/);
});

test("Data import and export rows use approved SVG artwork", () => {
  assert.match(importSvg, /M12 14L11\.6464 14\.3536/);
  assert.match(exportSvg, /M12 5L11\.6464 4\.64645/);
  assert.match(uiPolish, /export\.svg/);
  assert.match(uiPolish, /import\.svg/);
});

test("header logo artwork fills more of its frame", () => {
  assert.match(uiPolish, /\.logo-icon[\s\S]*width:\s*18px/);
  assert.match(uiPolish, /\.logo-icon[\s\S]*transform:\s*scale\(1\.2\)/);
});

test("window header renders one 512px QuotaShift artwork selected by app theme", () => {
  assert.match(header, /quota-shift-logo-512\.png/);
  assert.match(header, /quota-shift-logo-dark-512\.png/);
  assert.match(header, /src=\{isDarkMode \? logoDarkTheme : logoLightTheme\}/);
  assert.equal((header.match(/className="logo-icon"/g) || []).length, 1);
  assert.doesNotMatch(header, /logo-icon--dark-theme|logo-icon--light-theme/);
  assert.doesNotMatch(baseCss, /logo-icon--dark-theme|logo-icon--light-theme/);
});

test("ui polish stylesheet is loaded last so it can normalize legacy component styles", () => {
  assert.match(styles, /@import "\.\/styles\/desktop\/ui-polish\.css";\s*$/);
});
