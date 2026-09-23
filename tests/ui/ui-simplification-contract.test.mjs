import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("overlay UI scaling applies to the whole overlay surface without fixed pixel dimensions", () => {
  const css = read("src/styles/desktop/ui-adjustment.css");
  assert.match(css, /\.overlay-container\s*\{[^}]*width:\s*max-content/);
  assert.match(css, /\.overlay-container\s*\{[^}]*height:\s*max-content/);
  assert.match(css, /\.overlay-container\s*\{[\s\S]*?zoom:\s*var\(--overlay-ui-scale\)/);
  assert.match(css, /\.glass-card\s*\{[^}]*width:\s*max-content/);
  assert.doesNotMatch(
    css,
    /overlay-ui-scale-inverse|overlay-card-width|overlay-card-height|@media/,
  );
});

test("reset remaining badge is overridden to the same 13px square shape as tier/provider badges", () => {
  const css = read("src/styles/desktop/ui-adjustment.css");
  assert.match(css, /\.overlay-reset-badge\s*\{[\s\S]*?width:\s*13px/);
  assert.match(css, /\.overlay-reset-badge\s*\{[\s\S]*?height:\s*13px/);
  assert.match(css, /\.overlay-reset-badge\s*\{[\s\S]*?padding:\s*0;/);
  assert.match(css, /\.overlay-reset-badge\s*\{[\s\S]*?border-radius:\s*3px/);
});
