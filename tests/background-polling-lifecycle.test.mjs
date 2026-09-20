import test from "node:test";
import assert from "node:assert/strict";
import { createPollingHookHarness } from "./helpers/polling-hook-harness.mjs";

const dummyCoordinator = {
  activeTab: "claude",
  setActiveTab: () => {},
  antigravityAccounts: [],
  setAntigravityAccounts: () => {},
  activeAntigravityId: null,
  setActiveAntigravityId: () => {},
  codexAccounts: [],
  setCodexAccounts: () => {},
  activeCodexId: null,
  setActiveCodexId: () => {},
  codexPools: [],
  activeCodexPoolId: null,
  persistentWorkers: false,
  setPersistentWorkers: () => {},
  pollInterval: 60,
  setPollInterval: () => {},
  idlePollInterval: 900,
  setIdlePollInterval: () => {},
  platformVisibility: { antigravity: true, codex: true, claude: true },
  handlePlatformVisibilityChange: () => {},
  addAgOpen: false,
  setAddAgOpen: () => {},
  isCodexModalOpen: false,
  setIsCodexModalOpen: () => {},
  poolModalOpen: false,
  setPoolModalOpen: () => {},
  editingPool: null,
  setEditingPool: () => {},
  themeAndOverlay: {
    isDarkMode: true,
    handleToggleTheme: () => {},
    isOnline: true,
    statusText: "",
    keepAliveActive: false,
    handleToggleKeepAlive: () => {},
    overlayEnabled: false,
    handleToggleOverlay: () => {},
  },
  claudeMonitor: {
    claudeMonitorStatus: null,
    claudeAccountStatuses: [],
    claudePollIntervalSecs: 30,
    handleClaudePollIntervalChange: () => {},
    claudeStopThresholdPct: 90,
    handleClaudeStopThresholdChange: () => {},
    claudeAutoStopArmed: false,
    handleResumeClaudeAccount: () => {},
  },
  codexModelScan: {
    codexModelScanProgress: null,
    handleRescanAllCodexModels: () => {},
    codexModelCache: {},
    fetchCodexModelCatalog: () => {},
  },
  codexRouter: {
    poolRoutingEnabled: false,
    poolRoutingBusy: false,
    routerStatus: null,
    handleToggleCodexPoolRouting: () => {},
  },
  localSession: {
    handleAddLocalSessionToMonitored: () => {},
    handleLocalAntigravitySessionCaptured: () => {},
  },
  usageAndOverlay: {
    trackedAccountId: null,
    trackedProvider: "claude",
    handleTrackClaude: () => {},
  },
  accountOps: {
    handleDeleteCodexPool: () => {},
    handleActivateCodexPool: () => {},
    handleDeleteCodexAccount: () => {},
    handleApplyCodexAccount: () => {},
    handleTrackCurrentCodexAccount: () => {},
    handleSwitchBestCodex: () => {},
    trackingCurrentProvider: null,
  },
  backups: {
    handleExportPools: () => {},
    handleImportPools: () => {},
  },
  bootstrap: {
    triggerRefresh: () => {},
    lastFullStatus: null,
  },
  refreshAntigravityAccountsCloudFirst: () => {},
};

function setupClaudeMonitorHarness(initialProps = {}) {
  const harness = createPollingHookHarness({
    initialProps: {
      platformVisible: true,
      guardrailsActive: false,
      pollIntervalSecs: 900,
      idlePollIntervalSecs: 900,
      monitoredAccountId: null,
      ...initialProps,
    },
  });

  let capturedShowToast = null;
  const appModule = harness.transpileAndLoadModule("src/App.tsx", {
    "./hooks/useAppCoordinator": {
      useAppCoordinator: (showToast) => {
        capturedShowToast = showToast;
        return dummyCoordinator;
      },
    },
    "./hooks/useCardLayoutMode": {
      useCardLayoutMode: () => ({ cardLayoutMode: "grid", handleCardLayoutModeChange: () => {} }),
    },
    "./hooks/useAppInAppShortcuts": {
      useAppInAppShortcuts: () => ({
        settingsOpen: false,
        onOpenSettings: () => {},
        onCloseSettings: () => {},
        claudeAddRequestId: 0,
      }),
    },
    "./utils/common/use-global-shortcuts": {
      useGlobalShortcuts: () => {},
    },
    "./utils/common/poll-interval": {
      sanitizePollInterval: (v) => v,
      savePollIntervalPreference: () => {},
    },
    "./utils/common/app-storage": {
      loadAntigravityAccounts: () => [],
      saveAntigravityAccounts: () => {},
      loadCodexAccounts: () => [],
      saveCodexAccounts: () => {},
    },
    "./utils/account/account-order": {
      saveAccountOrder: () => {},
      sortByOrder: (list) => list,
    },
    "./utils": {
      savePersistentWorkerPreference: () => {},
      buildCodexRouterConfig: () => ({}),
    },
  });

  const claudePreferences = {
    enabled: false,
    pollIntervalSecs: 30,
    autoResumeAtReset: false,
    fiveHour: { enabled: false, thresholdPct: 90 },
    weekly: { enabled: false, thresholdPct: 95 },
  };
  let latestClaudeSetStatuses = null;
  const stableClaudeSetStatuses = (statuses) => latestClaudeSetStatuses?.(statuses);
  const stableClaudeReorder = () => {};

  const claudeMonitorModule = harness.transpileAndLoadModule(
    "src/hooks/useClaudeAccountMonitor.ts",
    {
      "../utils/common/claude-preferences": {
        loadClaudePreferences: () => claudePreferences,
        normalizeClaudePreferences: (p) => p,
        saveClaudePreferences: () => true,
      },
      "../utils/claude/claude-polling": {
        claudeAdaptivePollIntervalSecs: (interval) =>
          initialProps.adaptivePollIntervalSecs ?? interval,
      },
      "../utils/claude/claude-guardrails": {
        claudeAccountGuardrailDecision: () => ({
          hit: false,
          fiveHourHit: false,
          weeklyHit: false,
        }),
      },
      "../utils/claude/claude-guardrail-notification": {
        notifyClaudeGuardrailSuspension: () => Promise.resolve(),
      },
      "./useClaudeProfilePaths": {
        useClaudeProfilePaths: () => ({
          manualProfilePaths: [],
          manualProfilePathsRef: { current: [] },
          addProfilePath: () => {},
        }),
      },
      "./useClaudeCurrentAccountResolver": {
        useClaudeCurrentAccountResolver: () => ({
          isResolvingCurrentAccount: false,
          resolveCurrentAccount: () => {},
        }),
      },
      "./useClaudeAccountRefresh": {
        useClaudeAccountRefresh: () => ({
          refreshingAccountIds: new Set(),
          refreshAccountUsage: () => {},
        }),
      },
      "./useClaudeAccountResume": {
        useClaudeAccountResume: () => async () => {},
      },
      "./useClaudeAccountOrdering": {
        useClaudeAccountOrdering: (_statusesRef, setStatuses) => {
          latestClaudeSetStatuses = setStatuses;
          return {
            setStatuses: stableClaudeSetStatuses,
            handleReorderClaudeAccounts: stableClaudeReorder,
          };
        },
      },
    },
  );

  harness.setRender((props) => {
    appModule.App();
    return claudeMonitorModule.useClaudeAccountMonitor(
      capturedShowToast,
      props.platformVisible,
      props.guardrailsActive,
      props.pollIntervalSecs,
      props.idlePollIntervalSecs,
      props.monitoredAccountId,
    );
  });

  return { harness, claudePreferences };
}

test("Task 1: Claude polling lifecycle contract with real App showToast", async () => {
  const { harness } = setupClaudeMonitorHarness();

  await harness.mount();
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);

  await harness.rerender();
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);

  await harness.advanceBy(899_999);
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);

  await harness.advanceBy(1);
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 2);

  harness.unmount();
});

test("Task 1: fresh empty results settle without a render loop", async () => {
  const { harness } = setupClaudeMonitorHarness();
  harness.setIpcHandler("get_claude_account_statuses", async () => []);

  await harness.mount();
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);

  await harness.rerender();
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);
  harness.unmount();
});

test("Task 1: unrelated state changes do not restart polling effect prematurely", async () => {
  const { harness } = setupClaudeMonitorHarness();

  await harness.mount();
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);

  // 10 consecutive rerenders simulating unrelated user interactions
  for (let i = 0; i < 10; i++) {
    await harness.rerender({
      platformVisible: true,
      guardrailsActive: false,
      pollIntervalSecs: 900,
      idlePollIntervalSecs: 900,
    });
    await harness.flush();
  }
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);
  harness.unmount();
});

test("Task 1: a real poll interval change replaces the timer with the new duration", async () => {
  const { harness } = setupClaudeMonitorHarness({ pollIntervalSecs: 900 });

  await harness.mount();
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);

  // Change poll interval to 60 seconds
  await harness.rerender({
    platformVisible: true,
    guardrailsActive: false,
    pollIntervalSecs: 60,
    idlePollIntervalSecs: 900,
  });
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 2);

  await harness.advanceBy(59_999);
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 2);

  await harness.advanceBy(1);
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 3);
  harness.unmount();
});

test("Task 1: hidden Claude stops polling even when an account is tracked", async () => {
  const { harness } = setupClaudeMonitorHarness({
    platformVisible: false,
    guardrailsActive: false,
    pollIntervalSecs: 60,
    monitoredAccountId: "claude-account-a",
  });

  await harness.mount();
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 0);

  await harness.advanceBy(60_000);
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 0);
  harness.unmount();
});

test("Task 1: hidden Claude stops polling even when guardrails are enabled", async () => {
  const { harness } = setupClaudeMonitorHarness({
    platformVisible: false,
    guardrailsActive: true,
    pollIntervalSecs: 20,
    monitoredAccountId: "claude-account-a",
  });

  await harness.mount();
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 0);

  await harness.advanceBy(120_000);
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 0);
  harness.unmount();
});

test("Task 1: tracked Claude uses the global rate exactly when guardrails are OFF", async () => {
  const { harness, claudePreferences } = setupClaudeMonitorHarness({
    platformVisible: true,
    guardrailsActive: false,
    pollIntervalSecs: 60,
    monitoredAccountId: "claude-account-a",
    adaptivePollIntervalSecs: 300,
  });
  claudePreferences.reduceLowUsageFrequency = true;

  await harness.mount();
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);

  await harness.advanceBy(59_999);
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);
  await harness.advanceBy(1);
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 2);
  harness.unmount();
});

test("Task 1: disabling platform visibility with guardrails OFF cancels polling", async () => {
  const { harness } = setupClaudeMonitorHarness();

  await harness.mount();
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);

  await harness.rerender({
    platformVisible: false,
    guardrailsActive: false,
    pollIntervalSecs: 900,
  });
  await harness.flush();

  // Advance past the 900s interval - should NOT fire because platform is disabled and guardrails are off
  await harness.advanceBy(1_000_000);
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);
  harness.unmount();
});

test("Task 1: unmount cancels scheduled timer", async () => {
  const { harness } = setupClaudeMonitorHarness();

  await harness.mount();
  await harness.flush();
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);

  harness.unmount();
  await harness.advanceBy(1_000_000);
  assert.equal(harness.countInvocations("get_claude_account_statuses"), 1);
});

function setupRouterHarness(initialProps = {}) {
  const harness = createPollingHookHarness({
    initialProps: {
      poolRoutingEnabled: false,
      codexAccounts: [{ id: "acc-1", label: "Acc 1", apiKey: "k1" }],
      setCodexAccounts: () => {},
      codexPools: [{ id: "pool-1", name: "Pool 1", model: "gpt-5", accountIds: ["acc-1"] }],
      codexUsageCache: {},
      codexModelCache: {},
      activeCodexId: "acc-1",
      activeCodexPoolId: "pool-1",
      recordRoutedCodexUse: () => {},
      showToast: () => {},
      ...initialProps,
    },
  });

  const routerModule = harness.transpileAndLoadModule("src/hooks/useCodexRouterManager.ts", {
    "../utils/auth/auth": { deobfuscate: (x) => x, obfuscate: (x) => x },
    "../utils/common/app-storage": { saveCodexAccounts: () => {} },
    "../utils": {
      buildCodexRouterConfig: () => ({}),
      refreshActivePoolOAuthCredentials: async ({ accounts }) => ({
        accounts,
        refreshedAccountIds: [],
        failedAccountIds: [],
      }),
    },
  });

  let routingState = null;
  harness.setRender((props) => {
    routingState = routerModule.useCodexRouterManager(props);
    const react = harness.reactMock;
    react.useEffect(() => {
      if (props.poolRoutingEnabled && !routingState.poolRoutingEnabled) {
        routingState.setPoolRoutingEnabled(true);
      } else if (!props.poolRoutingEnabled && routingState.poolRoutingEnabled) {
        routingState.setPoolRoutingEnabled(false);
      }
    }, [props.poolRoutingEnabled, routingState.poolRoutingEnabled]);
    return routingState;
  });

  return { harness, getRoutingState: () => routingState };
}

test("Task 2: router OFF makes no periodic status requests", async () => {
  const { harness } = setupRouterHarness({ poolRoutingEnabled: false });

  await harness.mount();
  await harness.flush();
  assert.equal(harness.countInvocations("get_codex_router_status"), 0);

  await harness.advanceBy(10_000);
  await harness.flush();
  assert.equal(harness.countInvocations("get_codex_router_status"), 0);
  harness.unmount();
});

test("Task 2: router ON polls every 2,000 ms and settles despite callback recreation", async () => {
  let callbackInvocations = 0;
  const { harness } = setupRouterHarness({
    poolRoutingEnabled: true,
    recordRoutedCodexUse: () => {
      callbackInvocations++;
    },
  });

  await harness.mount();
  await harness.flush();
  assert.equal(harness.countInvocations("get_codex_router_status"), 1);

  // Rerender with a newly created callback identity (simulating parent render)
  await harness.rerender({
    poolRoutingEnabled: true,
    codexAccounts: [{ id: "acc-1", label: "Acc 1", apiKey: "k1" }],
    setCodexAccounts: () => {},
    codexPools: [{ id: "pool-1", name: "Pool 1", model: "gpt-5", accountIds: ["acc-1"] }],
    codexUsageCache: {},
    codexModelCache: {},
    activeCodexId: "acc-1",
    activeCodexPoolId: "pool-1",
    recordRoutedCodexUse: () => {
      callbackInvocations++;
    },
    showToast: () => {},
  });
  await harness.flush();
  // Should NOT immediately trigger another get_codex_router_status because recordRoutedCodexUse is in a ref
  assert.equal(harness.countInvocations("get_codex_router_status"), 1);

  await harness.advanceBy(1999);
  assert.equal(harness.countInvocations("get_codex_router_status"), 1);

  await harness.advanceBy(1);
  await harness.flush();
  assert.equal(harness.countInvocations("get_codex_router_status"), 2);

  harness.unmount();
});

test("Task 2: router routed request count increments trigger notification callback", async () => {
  let routedAccountIdReceived = null;
  let statusCount = 0;

  const { harness } = setupRouterHarness({
    poolRoutingEnabled: true,
    recordRoutedCodexUse: (accId) => {
      routedAccountIdReceived = accId;
    },
  });

  harness.setIpcHandler("get_codex_router_status", async () => {
    statusCount++;
    return {
      running: true,
      healthy: true,
      routedRequestCount: statusCount > 1 ? 5 : 0,
      lastRoutedAccountId: statusCount > 1 ? "acc-routed-42" : null,
      lastRoutedModel: "gpt-5",
    };
  });

  await harness.mount();
  await harness.flush();
  assert.equal(routedAccountIdReceived, null);

  // Advance by 2000 ms to trigger next poll
  await harness.advanceBy(2000);
  await harness.flush();
  assert.equal(routedAccountIdReceived, "acc-routed-42");

  // Advance again with same count (no new routed requests)
  routedAccountIdReceived = null;
  await harness.advanceBy(2000);
  await harness.flush();
  assert.equal(routedAccountIdReceived, null); // Not re-triggered!

  harness.unmount();
});

test("Task 2: unmounting router manager stops status polling intervals", async () => {
  const { harness } = setupRouterHarness({ poolRoutingEnabled: true });

  await harness.mount();
  await harness.flush();
  assert.equal(harness.countInvocations("get_codex_router_status"), 1);

  harness.unmount();
  await harness.advanceBy(10_000);
  await harness.flush();
  assert.equal(harness.countInvocations("get_codex_router_status"), 1);
});
