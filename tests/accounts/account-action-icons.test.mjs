import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const antigravity = fs.readFileSync(
  "src/components/antigravity/AntigravityAccountActions.tsx",
  "utf8",
);
const codex = fs.readFileSync("src/components/codex/CodexAccountCard.tsx", "utf8");
const applyIcon = fs.readFileSync("src/components/common/ApplyAccountIcon.tsx", "utf8");
const trackIcon = fs.readFileSync("src/components/common/TrackCurrentAccountIcon.tsx", "utf8");
const css = fs.readFileSync("src/styles/accounts/account-card-actions.css", "utf8");
const poolCss = fs.readFileSync("src/styles/codex/codex-pools.css", "utf8");

for (const [name, source] of [
  ["Antigravity", antigravity],
  ["Codex", codex],
]) {
  test(`${name} account Apply action is icon-only with the approved checkmark`, () => {
    assert.match(source, /className="card-apply-btn"/);
    assert.match(source, /<ApplyAccountIcon\s*\/>/);
    assert.match(source, /aria-label="Set this account as the active workspace account"/);
    assert.doesNotMatch(source, />\s*Apply\s*<\/button>/);
  });

  test(`${name} applied account uses the animated Track Current Account icon only`, () => {
    assert.match(source, /className="card-active-badge"/);
    assert.match(source, /data-tooltip="This is currently active account at this device"/);
    assert.match(source, /<TrackCurrentAccountIcon size=\{12\} gradient\s*\/>/);
    assert.doesNotMatch(source, /<span className="card-active-dot"/);
    assert.doesNotMatch(source, />\s*Active\s*<\/span>/);
  });
}

test("Apply icon preserves the supplied checkmark artwork", () => {
  assert.match(applyIcon, /viewBox="0 -3 32 32"/);
  assert.match(applyIcon, /fill="currentColor"/);
  assert.match(applyIcon, /M548\.783 1040\.2C547\.188 1038\.57/);
});

test("Track Current Account icon supports animated gradient active state", () => {
  assert.match(trackIcon, /linearGradient/);
  assert.match(trackIcon, /#facc15/);
  assert.match(trackIcon, /#fb923c/);
  assert.match(trackIcon, /#f97316/);
  assert.match(trackIcon, /track-current-account-icon--gradient/);
  assert.match(css, /@keyframes active-account-gradient-shift/);
  assert.match(
    css,
    /\.card-active-badge \.track-current-account-icon--gradient[\s\S]*animation:\s*active-account-gradient-shift/,
  );
});

test("Apply normal state matches the outlined models and refresh action shell", () => {
  assert.match(
    css,
    /\.card-apply-btn\s*\{[\s\S]*align-self:\s*center;[\s\S]*width:\s*22px;[\s\S]*height:\s*22px;[\s\S]*padding:\s*4px;[\s\S]*border:\s*1px solid var\(--border-color\);[\s\S]*background:\s*transparent;[\s\S]*color:\s*var\(--text-secondary\)/,
  );
  for (const selector of ["codex-card-models-btn", "codex-card-refresh-btn"]) {
    assert.match(
      poolCss,
      new RegExp(
        `\\.${selector}\\s*\\{[\\s\\S]*align-self:\\s*center;[\\s\\S]*width:\\s*22px;[\\s\\S]*height:\\s*22px;[\\s\\S]*padding:\\s*4px;[\\s\\S]*border:\\s*1px solid var\\(--border-color\\);[\\s\\S]*background:\\s*transparent;[\\s\\S]*color:\\s*var\\(--text-secondary\\)`,
      ),
    );
  }
  assert.match(css, /@keyframes warm-action-color-shift/);
  assert.match(
    css,
    /\.card-apply-btn:hover \.apply-account-icon[\s\S]*animation:\s*warm-action-color-shift/,
  );
  assert.match(css, /#facc15/);
  assert.match(css, /#f97316/);
});

test("Apply and active controls use compact icon-only dimensions", () => {
  assert.match(
    css,
    /\.card-active-badge\s*\{[\s\S]*width:\s*22px;[\s\S]*height:\s*22px[\s\S]*background:\s*transparent;[\s\S]*border:\s*none/,
  );
});

test("reauth, refresh, models, apply, and active mark share the same 22px control box", () => {
  const authCss = fs.readFileSync("src/styles/accounts/account-auth.css", "utf8");
  for (const source of [css, poolCss, authCss]) {
    assert.match(source, /width:\s*22px/);
    assert.match(source, /height:\s*22px/);
    assert.match(source, /padding:\s*4px/);
  }
});
