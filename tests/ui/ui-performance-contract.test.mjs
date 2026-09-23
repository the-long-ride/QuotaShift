import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readWithCssImports } from "../css-helper.mjs";

const read = (path) => {
  const content = readWithCssImports(path);
  if (path === "src/components/overlay/OverlayApp.tsx") {
    const cardPath = new URL("../../src/components/overlay/OverlayCard.tsx", import.meta.url);
    return content + (fs.existsSync(cardPath) ? fs.readFileSync(cardPath, "utf8") : "");
  }
  return content;
};

test("overlay publication uses in-memory tracked refs instead of repeated storage reads", () => {
  const app = read("src/App.tsx");
  const publishStart = app.indexOf("const publishOverlayUpdate");
  const publishEnd = app.indexOf("useEffect(() =>", publishStart);
  assert.ok(publishStart >= 0 && publishEnd > publishStart);
  const publish = app.slice(publishStart, publishEnd);
  assert.match(publish, /persistedTrackedProviderRef\.current/);
  assert.match(publish, /trackedAccountIdRef\.current/);
  assert.doesNotMatch(publish, /localStorage\.getItem\(OVERLAY_TRACKED_PROVIDER_KEY\)/);
  assert.doesNotMatch(publish, /localStorage\.getItem\(OVERLAY_TRACKED_ACCOUNT_ID_KEY\)/);
});

test("overlay tracking preserves legacy Codex fallback and synchronizes React tracking state", () => {
  const app = read("src/App.tsx");
  const publishStart = app.indexOf("const publishOverlayUpdate");
  const publishEnd = app.indexOf("useEffect(() =>", publishStart);
  assert.ok(publishStart >= 0 && publishEnd > publishStart);
  const publish = app.slice(publishStart, publishEnd);

  assert.match(app, /persistedTrackedProviderRef\s*=\s*useRef<string \| null>\(\s*localStorage\.getItem\(OVERLAY_TRACKED_PROVIDER_KEY\),?\s*\)/);
  assert.match(publish, /const savedTrackedProvider = persistedTrackedProviderRef\.current/);
  assert.match(publish, /isCodexTracked\s*=\s*savedTrackedProvider\s*===\s*["']codex["'][\s\S]*?savedTrackedProvider\s*!==\s*["']antigravity["'][\s\S]*?Boolean\(lastFullStatus\?\.monitoredCodex\)/);
  assert.match(app, /const syncTrackedIdentityState = [\s\S]*?trackedAccountIdRef\.current !== accountId[\s\S]*?setTrackedAccountId\(accountId\)/);
  assert.doesNotMatch(publish, /trackedAccountIdRef\.current = acc\.id;[^\n}]*if \(trackedAccountIdRef\.current !== acc\.id\)/);
});

test("frequently updated overlay quota bars animate transform rather than layout width", () => {
  const overlayApp = read("src/components/overlay/OverlayApp.tsx");
  const overlayCss = read("src/styles/desktop/overlay.css");
  assert.match(overlayApp, /transform:\s*`scaleX\(/);
  assert.match(overlayCss, /\.overlay-progress-bar\s*\{[\s\S]*?width:\s*100%/);
  assert.match(overlayCss, /\.overlay-progress-bar\s*\{[\s\S]*?transform-origin:\s*left center/);
  assert.doesNotMatch(overlayCss, /\.overlay-progress-bar\s*\{[\s\S]*?transition:\s*width/);
});
