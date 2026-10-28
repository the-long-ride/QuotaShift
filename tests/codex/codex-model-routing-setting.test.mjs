import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  loadCodexModelRoutingPreference,
  saveCodexModelRoutingPreference,
  CODEX_MODEL_ROUTING_KEY,
  CODEX_MODEL_ROUTING_CHANGED_EVENT,
} from "../../.test-build/common/settings/codex-model-routing.js";

test("loadCodexModelRoutingPreference defaults to false when unconfigured", () => {
  const store = new Map();
  const mockStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
  };

  assert.equal(loadCodexModelRoutingPreference(mockStorage), false);
});

test("saveCodexModelRoutingPreference persists boolean state to storage", () => {
  const store = new Map();
  const mockStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
  };

  saveCodexModelRoutingPreference(true, mockStorage);
  assert.equal(store.get(CODEX_MODEL_ROUTING_KEY), "true");
  assert.equal(loadCodexModelRoutingPreference(mockStorage), true);

  saveCodexModelRoutingPreference(false, mockStorage);
  assert.equal(store.get(CODEX_MODEL_ROUTING_KEY), "false");
  assert.equal(loadCodexModelRoutingPreference(mockStorage), false);
});

test("loadCodexModelRoutingPreference handles null storage or storage exception", () => {
  assert.equal(loadCodexModelRoutingPreference(null), false);
  const throwingStorage = {
    getItem: () => {
      throw new Error("storage failed");
    },
  };
  assert.equal(loadCodexModelRoutingPreference(throwingStorage), false);
});

test("saveCodexModelRoutingPreference dispatches window event and handles throw", () => {
  let eventFired = null;
  const originalWindow = globalThis.window;
  globalThis.window = {
    dispatchEvent: (evt) => {
      eventFired = evt;
    },
  };

  const store = new Map();
  const mockStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
  };

  saveCodexModelRoutingPreference(true, mockStorage);
  assert.ok(eventFired);
  assert.equal(eventFired.type, CODEX_MODEL_ROUTING_CHANGED_EVENT);
  assert.equal(eventFired.detail.enabled, true);

  const throwingStorage = {
    setItem: () => {
      throw new Error("quota exceeded");
    },
  };
  assert.doesNotThrow(() => saveCodexModelRoutingPreference(false, throwingStorage));

  globalThis.window = originalWindow;
});

test("AppearanceSettingsSection renders Use Codex Model Routing setting", () => {
  const appearance = fs.readFileSync(
    "src/components/common/settings/AppearanceSettingsSection.tsx",
    "utf8",
  );
  const setting = fs.readFileSync(
    "src/components/common/settings-fields/CodexModelRoutingSetting.tsx",
    "utf8",
  );

  assert.match(appearance, /<CodexModelRoutingSetting\s*\/>/);
  assert.match(appearance, /Model Routing/);
  assert.match(setting, /label="Use Codex Model Routing"/);
  assert.match(setting, /SettingsSwitchRow/);
});

test("CodexTab conditionally gates subtabs and pools behind routingEnabled", () => {
  const codexTab = fs.readFileSync("src/components/codex/CodexTab.tsx", "utf8");

  assert.match(codexTab, /useCodexModelRouting/);
  assert.match(codexTab, /routingEnabled && \([\s\S]*?codex-subtabs-wrap/);
  assert.match(codexTab, /\(!routingEnabled \|\| codexSection === "accounts"\)/);
  assert.match(codexTab, /routingEnabled && codexSection === "pools"/);
  assert.match(codexTab, /useCodexModelRouting=\{routingEnabled\}/);
});

test("CodexAccountCard conditionally gates CodexCardSiwcAction behind useCodexModelRouting", () => {
  const card = fs.readFileSync("src/components/codex/cards/CodexAccountCard.tsx", "utf8");

  assert.match(card, /useCodexModelRouting\?: boolean;/);
  assert.match(
    card,
    /useCodexModelRouting && isCodexAccountOAuth\(acc, cache\) && onAuthorizeSiwc && \([\s\S]*?<CodexCardSiwcAction/s,
  );
});

test("ClaudeTab conditionally hides Connect to QuotaShift when routing is disabled", () => {
  const claudeTab = fs.readFileSync("src/components/claude/ClaudeTab.tsx", "utf8");

  assert.match(claudeTab, /useCodexModelRouting/);
  assert.match(
    claudeTab,
    /style=\{routingEnabled \? undefined : \{ display: "none" \}\}[\s\S]*?Connect to QuotaShift/s,
  );
});
