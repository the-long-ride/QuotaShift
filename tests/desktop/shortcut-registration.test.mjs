import test from "node:test";
import assert from "node:assert/strict";

import { createShortcutRegistrationController } from "../../.test-build/shortcut-registration.js";

function createFakePort() {
  const active = new Set();
  const handlers = new Map();
  const operations = [];

  return {
    active,
    operations,
    press(shortcut) {
      handlers.get(shortcut)?.();
    },
    port: {
      async isRegistered(shortcut) {
        return active.has(shortcut);
      },
      async register(shortcut, onPressed) {
        operations.push(`register:${shortcut}`);
        if (active.has(shortcut)) throw new Error(`already registered: ${shortcut}`);
        active.add(shortcut);
        handlers.set(shortcut, onPressed);
      },
      async unregister(shortcuts) {
        const values = Array.isArray(shortcuts) ? shortcuts : [shortcuts];
        for (const shortcut of values) {
          operations.push(`unregister:${shortcut}`);
          active.delete(shortcut);
          handlers.delete(shortcut);
        }
      },
    },
  };
}

test("reclaims shortcuts left registered by a previous WebView", async () => {
  const fake = createFakePort();
  const shortcut = "CommandOrControl+Alt+D";
  fake.active.add(shortcut);
  const controller = createShortcutRegistrationController(fake.port, {
    onToggleOverlay() {},
    onRefreshAccount() {},
  });

  await controller.replace({ toggleOverlay: shortcut, refreshAccount: "" });

  assert.equal(fake.active.has(shortcut), true);
  const unregisterIndex = fake.operations.indexOf(`unregister:${shortcut}`);
  const registerIndex = fake.operations.indexOf(`register:${shortcut}`);
  assert.ok(unregisterIndex > -1, "stale application registration must be removed");
  assert.ok(
    registerIndex > unregisterIndex,
    "shortcut must be registered again after stale cleanup",
  );

  await controller.dispose();
  assert.equal(fake.active.size, 0);
});

test("rebinding replaces old global shortcuts immediately", async () => {
  const fake = createFakePort();
  let toggles = 0;
  let refreshes = 0;
  const controller = createShortcutRegistrationController(fake.port, {
    onToggleOverlay() {
      toggles += 1;
    },
    onRefreshAccount() {
      refreshes += 1;
    },
  });

  await controller.replace({
    toggleOverlay: "CommandOrControl+Alt+D",
    refreshAccount: "CommandOrControl+Alt+R",
  });
  fake.press("CommandOrControl+Alt+D");
  fake.press("CommandOrControl+Alt+R");
  assert.equal(toggles, 1);
  assert.equal(refreshes, 1);

  const rebinding = controller.replace({
    toggleOverlay: "CommandOrControl+Shift+D",
    refreshAccount: "CommandOrControl+Shift+R",
  });

  // The persisted preference has changed, so the previous handlers must become inert
  // synchronously even while native unregister/register calls are still queued.
  fake.press("CommandOrControl+Alt+D");
  fake.press("CommandOrControl+Alt+R");
  assert.equal(toggles, 1);
  assert.equal(refreshes, 1);

  await rebinding;
  assert.deepEqual(
    [...fake.active].sort(),
    ["CommandOrControl+Shift+D", "CommandOrControl+Shift+R"].sort(),
    "only the newly configured shortcuts may remain active",
  );
  assert.equal(fake.active.has("CommandOrControl+Alt+D"), false);
  assert.equal(fake.active.has("CommandOrControl+Alt+R"), false);

  fake.press("CommandOrControl+Shift+D");
  fake.press("CommandOrControl+Shift+R");
  assert.equal(toggles, 2);
  assert.equal(refreshes, 2);

  const firstNewRegistration = fake.operations.findIndex((op) =>
    op.startsWith("register:CommandOrControl+Shift"),
  );
  assert.ok(firstNewRegistration > -1);
  assert.ok(
    fake.operations.indexOf("unregister:CommandOrControl+Alt+D") < firstNewRegistration,
    "old toggle shortcut must be unregistered before the new binding is registered",
  );
  assert.ok(
    fake.operations.indexOf("unregister:CommandOrControl+Alt+R") < firstNewRegistration,
    "old refresh shortcut must be unregistered before the new binding is registered",
  );

  await controller.dispose();
  assert.equal(fake.active.size, 0);
});

test("dispose waits for in-flight registration and removes it", async () => {
  const active = new Set();
  let releaseRegistration;
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const gate = new Promise((resolve) => {
    releaseRegistration = resolve;
  });

  const controller = createShortcutRegistrationController(
    {
      async register(shortcut) {
        markStarted();
        await gate;
        active.add(shortcut);
      },
      async unregister(shortcuts) {
        const values = Array.isArray(shortcuts) ? shortcuts : [shortcuts];
        for (const shortcut of values) active.delete(shortcut);
      },
    },
    { onToggleOverlay() {}, onRefreshAccount() {} },
  );

  const applying = controller.replace({
    toggleOverlay: "CommandOrControl+Alt+D",
    refreshAccount: "",
  });
  await started;

  const disposing = controller.dispose();
  releaseRegistration();
  await Promise.all([applying, disposing]);

  assert.equal(
    active.size,
    0,
    "cleanup must not leave an asynchronously registered shortcut behind",
  );
});

test("StrictMode-style remount serializes cleanup before the replacement registers", async () => {
  const active = new Set();
  const handlers = new Map();
  let releaseFirst;
  let markFirstStarted;
  let firstRegistration = true;
  const firstStarted = new Promise((resolve) => {
    markFirstStarted = resolve;
  });
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const port = {
    async register(shortcut, onPressed) {
      if (active.has(shortcut)) throw new Error(`already registered: ${shortcut}`);
      active.add(shortcut);
      handlers.set(shortcut, onPressed);
      if (firstRegistration) {
        firstRegistration = false;
        markFirstStarted();
        await firstGate;
      }
    },
    async unregister(shortcuts) {
      const values = Array.isArray(shortcuts) ? shortcuts : [shortcuts];
      for (const shortcut of values) {
        active.delete(shortcut);
        handlers.delete(shortcut);
      }
    },
  };

  const prefs = { toggleOverlay: "CommandOrControl+Alt+D", refreshAccount: "" };
  const firstController = createShortcutRegistrationController(port, {
    onToggleOverlay() {},
    onRefreshAccount() {},
  });
  const firstApply = firstController.replace(prefs);
  await firstStarted;

  const firstDispose = firstController.dispose();
  const replacementController = createShortcutRegistrationController(port, {
    onToggleOverlay() {},
    onRefreshAccount() {},
  });
  const replacementApply = replacementController.replace(prefs);

  releaseFirst();
  await Promise.all([firstApply, firstDispose, replacementApply]);

  assert.deepEqual([...active], ["CommandOrControl+Alt+D"]);
  await replacementController.dispose();
  assert.equal(active.size, 0);
});

test("disabling a shortcut unregisters it and does not dispatch pressed events", async () => {
  const fake = createFakePort();
  let toggles = 0;
  let refreshes = 0;
  const controller = createShortcutRegistrationController(fake.port, {
    onToggleOverlay() {
      toggles += 1;
    },
    onRefreshAccount() {
      refreshes += 1;
    },
  });

  await controller.replace({
    toggleOverlay: "CommandOrControl+Alt+D",
    toggleOverlayEnabled: true,
    refreshAccount: "CommandOrControl+Alt+R",
    refreshAccountEnabled: true,
  });
  fake.press("CommandOrControl+Alt+D");
  fake.press("CommandOrControl+Alt+R");
  assert.equal(toggles, 1);
  assert.equal(refreshes, 1);
  assert.equal(fake.active.has("CommandOrControl+Alt+D"), true);
  assert.equal(fake.active.has("CommandOrControl+Alt+R"), true);

  // Disable toggleOverlay
  await controller.replace({
    toggleOverlay: "CommandOrControl+Alt+D",
    toggleOverlayEnabled: false,
    refreshAccount: "CommandOrControl+Alt+R",
    refreshAccountEnabled: true,
  });
  fake.press("CommandOrControl+Alt+D");
  fake.press("CommandOrControl+Alt+R");
  assert.equal(toggles, 1, "disabled shortcut handler should not be called");
  assert.equal(refreshes, 2, "enabled shortcut handler should still be called");
  assert.equal(
    fake.active.has("CommandOrControl+Alt+D"),
    false,
    "disabled shortcut must be unregistered",
  );
  assert.equal(
    fake.active.has("CommandOrControl+Alt+R"),
    true,
    "enabled shortcut must remain registered",
  );

  await controller.dispose();
  assert.equal(fake.active.size, 0);
});
