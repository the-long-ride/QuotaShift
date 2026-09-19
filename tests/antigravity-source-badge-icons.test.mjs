import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const iconsFile = fs.readFileSync("src/components/antigravity/AntigravityIcons.tsx", "utf8");
const actionsFile = fs.readFileSync(
  "src/components/antigravity/AntigravityAccountActions.tsx",
  "utf8",
);
const localCardFile = fs.readFileSync(
  "src/components/antigravity/AntigravityLocalSessionCard.tsx",
  "utf8",
);
const cssFile = fs.readFileSync("src/styles/codex-cards.css", "utf8");

test("AntigravityIcons exports Cloud API icon with correct artwork", () => {
  assert.match(iconsFile, /export const AntigravityCloudApiIcon/);
  assert.match(iconsFile, /M5\.25589 16C3\.8899 15\.0291/);
  assert.match(iconsFile, /M12 21V11M12 21L9 18M12 21L15 18/);
});

test("AntigravityIcons exports Background Worker Sandbox icon with correct artwork", () => {
  assert.match(iconsFile, /export const AntigravityWorkerSandboxIcon/);
  assert.match(iconsFile, /M709\.6 210l\.4-\.2h\.2L512 96/);
  assert.match(iconsFile, /814 548\.3l-128\.8 73\.1v139\.1l-143\.9 83V530\.4L814 373\.1v175\.2z/);
});

test("AntigravityIcons exports Antigravity IDE icon with logo and code overlay", () => {
  assert.match(iconsFile, /export const AntigravityIdeIcon/);
  // Antigravity base logo path
  assert.match(iconsFile, /M265,84L282,85L293,88L305,94/);
  // Code overlay </> paths at bottom-right
  assert.match(iconsFile, /M355 410l27-27m-27 27l27 27/);
  assert.match(iconsFile, /M400 442l20-64/);
  assert.match(iconsFile, /M465 410l-27-27m27 27l-27 27/);
});

test("AntigravityAccountActions maps each retrieval source to its icon badge with tooltips", () => {
  // Uses helper function to resolve badge metadata
  assert.match(actionsFile, /getAntigravitySourceBadge/);

  // Cloud API source mapping and tooltips
  assert.match(actionsFile, /Usage was fetched from \$\{method\}/);
  assert.match(actionsFile, /"Cloud API"/);
  assert.doesNotMatch(actionsFile, /Cloud API \(Summary\)/);
  assert.match(actionsFile, /<AntigravityCloudApiIcon/);

  // Worker sandbox source mapping and tooltips
  assert.match(actionsFile, /Usage was fetched from \$\{method\}/);
  assert.match(actionsFile, /Background worker sandbox/);
  assert.match(actionsFile, /<AntigravityWorkerSandboxIcon/);

  // Antigravity IDE / Antigravity 2.0 source mapping
  assert.match(actionsFile, /Usage was fetched from Antigravity IDE \/ Antigravity 2\.0/);
  assert.match(actionsFile, /<AntigravityIdeIcon/);

  // Does not use attribute title for source badge
  assert.match(actionsFile, /className=\{sourceBadge\.className\}/);
  assert.match(actionsFile, /data-tooltip=\{sourceBadge\.tooltip\}/);
  assert.doesNotMatch(actionsFile, /title=\{sourceBadge\.tooltip\}/);
});

test("AntigravityLocalSessionCard includes Antigravity IDE icon badge with tooltip", () => {
  assert.match(localCardFile, /<AntigravityIdeIcon/);
  assert.match(
    localCardFile,
    /data-tooltip="Usage was fetched from Antigravity IDE \/ Antigravity 2\.0"/,
  );
  assert.doesNotMatch(localCardFile, /title=\{localSession\.email\}/);
});

test("codex-cards.css styles each source badge state", () => {
  assert.match(cssFile, /\.antigravity-exact-source--exact/);
  assert.match(cssFile, /\.antigravity-exact-source--cached_exact/);
  assert.match(cssFile, /\.antigravity-exact-source--cloud/);
  assert.match(cssFile, /\.antigravity-exact-source--ide_local/);
  assert.match(cssFile, /\.antigravity-exact-source--loading/);
});
