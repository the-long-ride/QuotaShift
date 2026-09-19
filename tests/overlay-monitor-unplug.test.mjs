import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("overlay-position provides isPositionOnActiveMonitor and getPrimaryMonitorBottomRight", async () => {
  const posSource = read("src/components/overlay/overlay-position.ts");
  assert.match(posSource, /export function isPositionOnActiveMonitor/);
  assert.match(posSource, /export async function getPrimaryMonitorBottomRight/);
  assert.match(posSource, /if\s*\(!isPositionOnActiveMonitor\(targetPos,\s*winSize,\s*monitors\)\)/);
  assert.match(posSource, /return await getPrimaryMonitorBottomRight\(winSize\)/);
});

test("overlay_clamp handles WM_DISPLAYCHANGE and defines reset_overlay_to_primary_bottom_right", () => {
  const clampSource = read("src-tauri/src/window/overlay_clamp.rs");
  assert.match(clampSource, /WM_DISPLAYCHANGE/);
  assert.match(clampSource, /reset_overlay_to_primary_bottom_right\(hwnd\)/);
  assert.match(clampSource, /SPI_GETWORKAREA/);
  assert.match(clampSource, /SetWindowPos/);
  assert.match(clampSource, /\[overlay\] reset position to primary monitor bottom-right/);
});

test("useOverlayDataAndWindow monitors display count and resets when on unplugged monitor", () => {
  const code = read("src/components/overlay/useOverlayDataAndWindow.ts");
  assert.match(code, /isPositionOnActiveMonitor\(currentPos,\s*winSize,\s*monitors\)/);
  assert.match(code, /getPrimaryMonitorBottomRight\(winSize\)/);
  assert.match(code, /STORAGE_OVERLAY_POS_KEY/);
});

test("backend logs ChatGPT usage fetch start, results, and errors with local timestamp and optional masked email", () => {
  const oauthCmd = read("src-tauri/src/app/commands/oauth.rs");
  assert.match(oauthCmd, /\[chatgpt_usage\] start fetching ChatGPT usage for.*account=/);
  assert.match(oauthCmd, /\[chatgpt_usage\] usage refreshed for.*account=/);
  assert.match(oauthCmd, /\[chatgpt_usage\] usage refresh FAILED for.*account=/);
  assert.match(oauthCmd, /\[chatgpt_oauth\] refreshing ChatGPT OAuth token/);
});

test("settings persistence: idle poll rate and persistent worker preference save and load from storage", () => {
  const app = read("src/App.tsx");
  const coord = read("src/hooks/useAppCoordinator.ts");

  assert.match(app, /saveIdlePollIntervalPreference\(sanitized\)/);
  assert.match(app, /onIdlePollIntervalChange=\{handleIdlePollIntervalChange\}/);
  assert.match(coord, /loadPersistentWorkerPreference\(\)/);
  assert.match(coord, /loadIdlePollIntervalPreference\(\)/);
});

test("Claude guardrails draft hook updates storage immediately on valid input changes", () => {
  const draftHook = read("src/components/claude/useClaudePreferencesDraft.ts");
  const controls = read("src/components/claude/ClaudeControls.tsx");

  assert.match(draftHook, /handlePollChange/);
  assert.match(draftHook, /handleFiveHourChange/);
  assert.match(draftHook, /handleWeeklyChange/);
  assert.match(controls, /onChange=\{\(event\) => handlePollChange\(event\.target\.value\)\}/);
  assert.match(controls, /onChange=\{\(event\) => handleFiveHourChange\(event\.target\.value\)\}/);
  assert.match(controls, /onChange=\{\(event\) => handleWeeklyChange\(event\.target\.value\)\}/);
});
