import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DEFAULT_PLATFORM_VISIBILITY,
  PLATFORM_VISIBILITY_KEY,
  firstVisiblePlatform,
  loadPlatformVisibilityPreference,
  savePlatformVisibilityPreference,
} from "../src/utils/common/platform-visibility.ts";

const createStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
  };
};

test("platform visibility defaults all supported platforms on and persists independently", () => {
  const storage = createStorage();
  assert.deepEqual(loadPlatformVisibilityPreference(storage), DEFAULT_PLATFORM_VISIBILITY);
  savePlatformVisibilityPreference({ antigravity: true, codex: false, claude: true }, storage);
  assert.deepEqual(loadPlatformVisibilityPreference(storage), {
    antigravity: true,
    codex: false,
    claude: true,
  });
  assert.equal(
    storage.getItem(PLATFORM_VISIBILITY_KEY),
    JSON.stringify({ antigravity: true, codex: false, claude: true }),
  );
});

test("firstVisiblePlatform follows main-tab order and supports all hidden", () => {
  assert.equal(firstVisiblePlatform({ antigravity: false, codex: true, claude: true }), "codex");
  assert.equal(firstVisiblePlatform({ antigravity: false, codex: false, claude: true }), "claude");
  assert.equal(firstVisiblePlatform({ antigravity: false, codex: false, claude: false }), null);
});

test("platform visibility drives main tabs and idle automatic quota polling without touching Keep-Alive", () => {
  const tabs = fs.readFileSync("src/components/app/AppTabBar.tsx", "utf8");
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const events = fs.readFileSync("src/hooks/useAppEventListeners.ts", "utf8");
  const bootstrap = fs.readFileSync("src/hooks/useAppSessionBootstrap.ts", "utf8");
  const coordinator = fs.readFileSync("src/hooks/useAppCoordinator.ts", "utf8");
  const keepAlive = fs.readFileSync("src/utils/antigravity/antigravity-keep-alive.ts", "utf8");

  assert.match(tabs, /platformVisibility\.antigravity/);
  assert.match(tabs, /platformVisibility\.codex/);
  assert.match(tabs, /platformVisibility\.claude/);
  assert.match(app, /platformVisibility=\{platformVisibility\}/);
  assert.match(app, /platformVisibility\[activeTab\]/);
  assert.match(events, /Math\.max\(5000, idlePollInterval \* 1000\)/);
  assert.match(events, /setInterval\([\s\S]*refreshVisibleIdlePlatforms/);
  assert.match(events, /if \(platformVisibility\.codex\)/);
  assert.match(events, /if \(platformVisibility\.antigravity\)/);
  assert.match(bootstrap, /if \(platformVisibility\.codex\)/);
  assert.match(bootstrap, /if \(platformVisibility\.antigravity\)/);
  assert.match(coordinator, /loadIdlePollIntervalPreference/);
  assert.match(
    coordinator,
    /useClaudeMonitor\(showToast, platformVisibility\.claude, idlePollInterval\)/,
  );
  assert.doesNotMatch(keepAlive, /platformVisibility|PLATFORM_VISIBILITY/);
});

test("idle platform polling uses a separate top-level effect", () => {
  const events = fs.readFileSync("src/hooks/useAppEventListeners.ts", "utf8");
  assert.match(events, /useEffect\(\(\) => \{[\s\S]*reconcileCurrentSessionLastUsed/);
  assert.match(events, /const refreshVisibleIdlePlatforms/);
  assert.match(events, /Math\.max\(5000, idlePollInterval \* 1000\)/);
});
