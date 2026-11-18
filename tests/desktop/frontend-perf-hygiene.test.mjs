import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createPollingHookHarness } from "../helpers/polling-hook-harness.mjs";

const read = (path) => fs.readFileSync(path, "utf8");

function installMockDocument(initialHidden = true) {
  const prevDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const prevLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const listeners = new Map();

  const mockDocument = {
    hidden: initialHidden,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn);
    },
    emit: (type) => {
      for (const fn of listeners.get(type) || []) {
        fn();
      }
    },
  };

  Object.defineProperty(globalThis, "document", {
    value: mockDocument,
    configurable: true,
    writable: true,
  });

  if (!globalThis.localStorage) {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
      configurable: true,
      writable: true,
    });
  }

  return {
    mockDocument,
    listeners,
    restore: () => {
      if (prevDescriptor) {
        Object.defineProperty(globalThis, "document", prevDescriptor);
      } else {
        delete globalThis.document;
      }
      if (prevLocalStorage) {
        Object.defineProperty(globalThis, "localStorage", prevLocalStorage);
      } else {
        delete globalThis.localStorage;
      }
    },
  };
}

test("UI polls pause when document.hidden is true and resume on visibilitychange", async () => {
  const docEnv = installMockDocument(true);
  try {
    const bgHarness = createPollingHookHarness({
      initialProps: { propRouterStatus: undefined, modalOpen: false },
      ipcHandlers: {
        agent_api_status: async () => ({
          running: false,
          port: null,
          writeEnabled: false,
          keyConfigured: false,
        }),
        get_codex_router_status: async () => ({
          running: false,
          healthy: false,
          routedRequestCount: 0,
        }),
      },
    });
    const bgModule = bgHarness.transpileAndLoadModule(
      "src/hooks/desktop/useBackgroundServicesStatus.ts",
      {},
    );
    bgHarness.setRender((props) =>
      bgModule.useBackgroundServicesStatus(props.propRouterStatus, undefined, props.modalOpen),
    );

    await bgHarness.mount();
    await bgHarness.flush();
    assert.equal(bgHarness.countInvocations("agent_api_status"), 1);

    await bgHarness.advanceBy(9_000);
    await bgHarness.flush();
    assert.equal(
      bgHarness.countInvocations("agent_api_status"),
      1,
      "background services interval must skip IPC polls while document.hidden is true",
    );

    docEnv.mockDocument.hidden = false;
    docEnv.mockDocument.emit("visibilitychange");
    await bgHarness.flush();
    assert.equal(
      bgHarness.countInvocations("agent_api_status"),
      2,
      "visibilitychange to visible should refresh background services immediately",
    );

    await bgHarness.advanceBy(3_000);
    await bgHarness.flush();
    assert.equal(bgHarness.countInvocations("agent_api_status"), 3);
    bgHarness.unmount();
    assert.equal(docEnv.listeners.get("visibilitychange")?.size ?? 0, 0);

    docEnv.mockDocument.hidden = true;
    const routerHarness = createPollingHookHarness({
      initialProps: {
        poolRoutingEnabled: true,
        codexAccounts: [{ id: "acc-1", label: "Acc 1", apiKey: "k1" }],
        setCodexAccounts: () => {},
        codexPools: [{ id: "pool-1", name: "Pool 1", model: "gpt-5", accountIds: ["acc-1"] }],
        modelPoolsV2: [
          {
            id: "pool-1",
            displayName: "Pool 1",
            publicModelName: "gpt-5",
            upstreamModelId: "gpt-5",
            enabled: true,
            memberAccountIds: ["acc-1"],
            authMode: "openai-api-key",
            routingPolicy: "cache-aware",
            modelSelectionMode: "manual",
          },
        ],
        codexUsageCache: {},
        codexModelCache: {},
        activeCodexId: "acc-1",
        activeCodexPoolId: "pool-1",
        recordRoutedCodexUse: () => {},
        showToast: () => {},
      },
    });
    const routerModule = routerHarness.transpileAndLoadModule(
      "src/hooks/codex/useCodexRouterManager.ts",
      {
        "../../utils/auth/auth": { deobfuscate: (x) => x, obfuscate: (x) => x },
        "../../utils/common/backup/app-storage": { saveCodexAccounts: () => {} },
        "../../utils/common/backup/app-constants": { loadRouterPort: () => null },
        "../../utils/codex/pools/codex-router": {
          buildCodexRouterConfig: () => ({}),
          refreshActivePoolOAuthCredentials: async ({ accounts }) => ({
            accounts,
            refreshedAccountIds: [],
            failedAccountIds: [],
          }),
        },
      },
    );
    routerHarness.setRender((props) => {
      const state = routerModule.useCodexRouterManager(props);
      routerHarness.reactMock.useEffect(() => {
        if (props.poolRoutingEnabled && !state.poolRoutingEnabled) {
          state.setPoolRoutingEnabled(true);
        }
      }, [props.poolRoutingEnabled, state.poolRoutingEnabled]);
      return state;
    });

    await routerHarness.mount();
    await routerHarness.flush();
    assert.equal(routerHarness.countInvocations("get_codex_router_status"), 1);

    await routerHarness.advanceBy(6_000);
    await routerHarness.flush();
    assert.equal(
      routerHarness.countInvocations("get_codex_router_status"),
      1,
      "router status interval must skip polls while document.hidden is true",
    );

    docEnv.mockDocument.hidden = false;
    docEnv.mockDocument.emit("visibilitychange");
    await routerHarness.flush();
    assert.equal(
      routerHarness.countInvocations("get_codex_router_status"),
      2,
      "visibilitychange to visible should poll router status immediately",
    );
    routerHarness.unmount();
    assert.equal(docEnv.listeners.get("visibilitychange")?.size ?? 0, 0);
  } finally {
    docEnv.restore();
  }
});

test("useAppEventListeners pauses refreshVisibleIdlePlatforms while keeping refreshMonitoredAccount active", () => {
  const source = read("src/hooks/app/useAppEventListeners.ts");
  const idleMarker = "const refreshVisibleIdlePlatforms = () => {";
  const monitoredMarker = "const refreshMonitoredAccount = () => {";
  const idleStart = source.indexOf(idleMarker);
  const monitoredStart = source.indexOf(monitoredMarker);
  assert.notEqual(idleStart, -1);
  assert.notEqual(monitoredStart, -1);

  const idleSection = source.slice(idleStart, monitoredStart);
  const monitoredSection = source.slice(monitoredStart);

  assert.match(idleSection, /document\.hidden/);
  assert.match(idleSection, /visibilitychange/);
  assert.doesNotMatch(
    monitoredSection,
    /document\.hidden/,
    "refreshMonitoredAccount keeps updating overlay and taskbar when main window is hidden",
  );
});

test("overlay and taskbar listeners guard async mount races with cancelled flag", () => {
  for (const file of [
    "src/hooks/app/tracking/useAppThemeAndOverlay.ts",
    "src/components/taskbar/TaskbarApp.tsx",
    "src/components/taskbar/useTaskbarWindowSync.ts",
    "src/components/overlay/useOverlayDataAndWindow.ts",
  ]) {
    const source = read(file);
    assert.match(source, /let cancelled = false;/, `${file} must track unmount cancellation`);
    assert.match(source, /cancelled = true;/, `${file} must mark cancelled = true on cleanup`);
    assert.match(
      source,
      /if\s*\(\s*cancelled\s*\)\s*[A-Za-z_]\w*\s*\(\s*\)/,
      `${file} must immediately dispose late-resolving listen/onMoved promises`,
    );
  }
});
