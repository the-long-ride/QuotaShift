import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLL_INTERVAL_SECS,
  MIN_POLL_INTERVAL_SECS,
  MAX_POLL_INTERVAL_SECS,
  POLL_INTERVAL_KEY,
  POLL_INTERVAL_LEGACY_KEY,
  loadPollIntervalPreference,
  savePollIntervalPreference,
  sanitizePollInterval,
} from "../.test-build/poll-interval.js";

function createMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    _map: map,
  };
}

test("sanitizePollInterval enforces bounds and defaults", () => {
  assert.equal(sanitizePollInterval(30), 30);
  assert.equal(sanitizePollInterval(4), MIN_POLL_INTERVAL_SECS);
  assert.equal(sanitizePollInterval(1), MIN_POLL_INTERVAL_SECS);
  assert.equal(sanitizePollInterval(0), MIN_POLL_INTERVAL_SECS);
  assert.equal(sanitizePollInterval(-10), MIN_POLL_INTERVAL_SECS);
  assert.equal(sanitizePollInterval(5000), MAX_POLL_INTERVAL_SECS);
  assert.equal(sanitizePollInterval("15"), 15);
  assert.equal(sanitizePollInterval("invalid"), DEFAULT_POLL_INTERVAL_SECS);
  assert.equal(sanitizePollInterval(null), DEFAULT_POLL_INTERVAL_SECS);
  assert.equal(sanitizePollInterval(undefined), DEFAULT_POLL_INTERVAL_SECS);
  assert.equal(sanitizePollInterval(NaN), DEFAULT_POLL_INTERVAL_SECS);
});

test("loadPollIntervalPreference returns default 30 when storage is empty", () => {
  const storage = createMockStorage();
  assert.equal(loadPollIntervalPreference(storage), DEFAULT_POLL_INTERVAL_SECS);
});

test("loadPollIntervalPreference loads saved value from primary key", () => {
  const storage = createMockStorage({ [POLL_INTERVAL_KEY]: "45" });
  assert.equal(loadPollIntervalPreference(storage), 45);
});

test("loadPollIntervalPreference falls back to legacy key", () => {
  const storage = createMockStorage({ [POLL_INTERVAL_LEGACY_KEY]: "60" });
  assert.equal(loadPollIntervalPreference(storage), 60);
});

test("savePollIntervalPreference persists sanitized string to storage", () => {
  const storage = createMockStorage();
  savePollIntervalPreference(120, storage);
  assert.equal(storage.getItem(POLL_INTERVAL_KEY), "120");

  savePollIntervalPreference(2, storage);
  assert.equal(storage.getItem(POLL_INTERVAL_KEY), String(MIN_POLL_INTERVAL_SECS));

  savePollIntervalPreference(10000, storage);
  assert.equal(storage.getItem(POLL_INTERVAL_KEY), String(MAX_POLL_INTERVAL_SECS));
});

test("App contracts: poll interval is persisted across restarts", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const appPath = path.resolve("src/App.tsx");
  const appSrc = fs.readFileSync(appPath, "utf-8");

  assert.match(appSrc, /loadPollIntervalPreference/);
  assert.match(appSrc, /savePollIntervalPreference/);
  assert.match(appSrc, /const \[pollInterval, setPollInterval\] = useState\(\(\) => loadPollIntervalPreference\(\)\);/);
  assert.match(appSrc, /const initialPollInterval = loadPollIntervalPreference\(\);/);
  assert.match(appSrc, /invoke\("set_poll_interval",\s*\{\s*seconds:\s*BigInt\(initialPollInterval\)\s*\}\)/);
  assert.match(appSrc, /savePollIntervalPreference\(sanitized\);/);
});

