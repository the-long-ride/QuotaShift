import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [icon, antigravity, codex] = await Promise.all([
  readFile(new URL("../src/components/common/TrackCurrentAccountIcon.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../src/components/antigravity/AntigravityTab.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/codex/CodexTab.tsx", import.meta.url), "utf8"),
]);

test("shared track-current icon uses theme-aware SVG presentation", () => {
  assert.match(icon, /viewBox="0 0 1024 1024"/);
  assert.match(icon, /currentColor/);
  assert.doesNotMatch(icon, /fill="#000000"/);
});

for (const [name, source] of [["Antigravity", antigravity], ["Codex", codex]]) {
  test(`${name} toolbar exposes the current-account action as icon-only to the left of Best button`, () => {
    assert.match(source, /TrackCurrentAccountIcon/);
    assert.match(source, /Track Current Account/);
    assert.match(source, /onTrackCurrentAccount/);
    assert.match(source, /isTrackingCurrentAccount/);
    assert.match(source, /disabled=\{isTrackingCurrentAccount\}/);
    assert.match(source, /account-action-btn--icon-only/);

    // Verify it is positioned to the left side of (before) the Best button in the actions toolbar
    const actionsBlock = source.match(/<div className="account-bar-actions">[\s\S]*?<\/div>/)?.[0] || "";
    const trackIndex = actionsBlock.indexOf("onTrackCurrentAccount");
    const bestIndex = actionsBlock.indexOf("onSwitchBest");
    assert.ok(trackIndex !== -1, "Track current account button must exist in actions toolbar");
    assert.ok(bestIndex !== -1, "Best button must exist in actions toolbar");
    assert.ok(trackIndex < bestIndex, "Track current account button must be to the left of the Best button");

    // Verify only icon is rendered inside the button (no visible text)
    assert.match(source, /<button[^>]*account-action-btn--icon-only[^>]*>\s*<TrackCurrentAccountIcon\s*\/>\s*<\/button>/);
  });
}
