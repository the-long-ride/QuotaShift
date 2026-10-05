import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = await import("../../.test-build/common/restart-on-switch.js");

const store = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
};

test("restart on switch defaults off", () => {
  assert.equal(m.loadRestartOnSwitch(store()), false);
  assert.equal(m.loadRestartOnSwitch(null), false);
});

test("restart on switch round-trips", () => {
  const s = store();
  m.saveRestartOnSwitch(true, s);
  assert.equal(m.loadRestartOnSwitch(s), true);
  m.saveRestartOnSwitch(false, s);
  assert.equal(m.loadRestartOnSwitch(s), false);
});

test("blocked storage falls back to off without throwing", () => {
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(m.loadRestartOnSwitch(blocked), false);
  assert.doesNotThrow(() => m.saveRestartOnSwitch(true, blocked));
  assert.doesNotThrow(() => m.saveRestartOnSwitch(true, null));
});

test("restart setting is rendered in the Monitoring tab", () => {
  const modal = readFileSync(
    new URL("../../src/components/common/SettingsModal.tsx", import.meta.url),
    "utf8",
  );
  const toggles = readFileSync(
    new URL("../../src/components/common/MonitoringToggles.tsx", import.meta.url),
    "utf8",
  );
  assert.match(modal, /<MonitoringToggles \/>/);
  assert.match(toggles, /<RestartOnSwitchSetting \/>/);
  assert.match(toggles, /<MultiTrackSettings \/>/);
});
