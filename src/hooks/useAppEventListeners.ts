import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  AntigravityWorkerProgress,
  CodexAccount,
  FullStatus,
} from "../utils/common/types";
import { OVERLAY_TRACKED_PROVIDER_KEY } from "../utils/common/app-constants";
import { resolveTrackedProviderTab } from "../utils/common/tracked-provider-tab";
import { loadAntigravityAccounts, loadCodexAccounts } from "../utils/common/app-storage";
import { syncCurrentSessionLastUsed } from "../utils/account/current-session-last-used";
import {
  PlatformId,
  PlatformVisibility,
  firstVisiblePlatform,
} from "../utils/common/platform-visibility";

const OVERLAY_TRACKED_ACCOUNT_ID_KEY = "quotashift_overlay_tracked_account_id";

export interface UseAppEventListenersParams {
  setActiveTab: (tab: PlatformId) => void;
  platformVisibility: PlatformVisibility;
  setAntigravityUsageCache: React.Dispatch<
    React.SetStateAction<Record<string, AntigravityUsageCacheEntry>>
  >;
  setLastFullStatus: (status: FullStatus | null) => void;
  updateLocalSessionFromStatus: (status: FullStatus) => void;
  fetchAccountUsage: (account: CodexAccount) => Promise<any>;
  maybeAutoFailoverActiveCodexPool: () => Promise<void>;
  refreshAntigravityAccountsCloudFirst: (
    accounts: AntigravityAccount[],
    force?: boolean,
  ) => Promise<any>;
  refreshTrackedAccountOnly: (payload: any) => Promise<void>;
  setAntigravityAccounts: (accounts: AntigravityAccount[]) => void;
  setCodexAccounts: (accounts: CodexAccount[]) => void;
  pollInterval: number;
  idlePollInterval: number;
}

export function useAppEventListeners({
  setLastFullStatus,
  updateLocalSessionFromStatus,
  fetchAccountUsage,
  maybeAutoFailoverActiveCodexPool,
  pollInterval,
  idlePollInterval,
  platformVisibility,
  refreshAntigravityAccountsCloudFirst,
  setActiveTab,
  setAntigravityUsageCache,
  refreshTrackedAccountOnly,
  setAntigravityAccounts,
  setCodexAccounts,
}: UseAppEventListenersParams) {
  const refreshTrackedAccountOnlyRef = useRef(refreshTrackedAccountOnly);
  refreshTrackedAccountOnlyRef.current = refreshTrackedAccountOnly;
  const platformVisibilityRef = useRef(platformVisibility);
  platformVisibilityRef.current = platformVisibility;
  const fetchAccountUsageRef = useRef(fetchAccountUsage);
  fetchAccountUsageRef.current = fetchAccountUsage;
  const maybeAutoFailoverActiveCodexPoolRef = useRef(maybeAutoFailoverActiveCodexPool);
  maybeAutoFailoverActiveCodexPoolRef.current = maybeAutoFailoverActiveCodexPool;
  const refreshAntigravityAccountsCloudFirstRef = useRef(refreshAntigravityAccountsCloudFirst);
  refreshAntigravityAccountsCloudFirstRef.current = refreshAntigravityAccountsCloudFirst;
  const setActiveTabRef = useRef(setActiveTab);
  setActiveTabRef.current = setActiveTab;
  const setAntigravityUsageCacheRef = useRef(setAntigravityUsageCache);
  setAntigravityUsageCacheRef.current = setAntigravityUsageCache;
  const setLastFullStatusRef = useRef(setLastFullStatus);
  setLastFullStatusRef.current = setLastFullStatus;
  const updateLocalSessionFromStatusRef = useRef(updateLocalSessionFromStatus);
  updateLocalSessionFromStatusRef.current = updateLocalSessionFromStatus;
  const setAntigravityAccountsRef = useRef(setAntigravityAccounts);
  setAntigravityAccountsRef.current = setAntigravityAccounts;
  const setCodexAccountsRef = useRef(setCodexAccounts);
  setCodexAccountsRef.current = setCodexAccounts;

  useEffect(() => {
    let active = true;
    let unlistenStatus: (() => void) | null = null;
    let unlistenWindow: (() => void) | null = null;
    let unlistenWorker: (() => void) | null = null;
    let unlistenRefreshUsage: (() => void) | null = null;

    const setupListeners = async () => {
      const uStatus = await listen<FullStatus | null>("status-updated", (event) => {
        setLastFullStatusRef.current(event.payload);
        updateLocalSessionFromStatusRef.current(event.payload as any);
      });
      if (!active) uStatus();
      else unlistenStatus = uStatus;

      const uWindow = await listen<boolean>("window-shown", () => {
        const savedProvider = localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY);
        const visibility = platformVisibilityRef.current;
        if (
          savedProvider === "antigravity" ||
          savedProvider === "codex" ||
          savedProvider === "claude"
        ) {
          const preferred = resolveTrackedProviderTab(savedProvider);
          const next = visibility[preferred] ? preferred : firstVisiblePlatform(visibility);
          if (next) setActiveTabRef.current(next);
          return;
        }
        invoke<FullStatus | null>("get_quota_status")
          .then((s) => {
            const preferred = resolveTrackedProviderTab(null, Boolean(s?.monitoredCodex));
            const next = visibility[preferred] ? preferred : firstVisiblePlatform(visibility);
            if (next) setActiveTabRef.current(next);
          })
          .catch(console.error);
      });
      if (!active) uWindow();
      else unlistenWindow = uWindow;

      const uWorker = await listen<AntigravityWorkerProgress>(
        "antigravity-worker-progress",
        (event) => {
          const p = event.payload;
          const isFinal = ["exact", "cached", "cloud_fallback", "error"].includes(p.phase);
          setAntigravityUsageCacheRef.current((prev) => ({
            ...prev,
            [p.accountId]: {
              ...prev[p.accountId],
              loading: !isFinal,
              exactState: p.phase,
              workerMessage: p.message,
            },
          }));
        },
      );
      if (!active) uWorker();
      else unlistenWorker = uWorker;

      const uRefreshUsage = await listen("request-refresh-usage", (event: any) => {
        const refreshTrackedAccountOnly = (p: any) => refreshTrackedAccountOnlyRef.current(p);
        refreshTrackedAccountOnly(event?.payload);
      });
      if (!active) uRefreshUsage();
      else unlistenRefreshUsage = uRefreshUsage;

      const uOverlayVis = await listen<boolean>("overlay-visibility-changed", () => {});
      if (!active) uOverlayVis();
    };

    setupListeners();
    return () => {
      active = false;
      unlistenStatus?.();
      unlistenWindow?.();
      unlistenWorker?.();
      unlistenRefreshUsage?.();
    };
  }, []);

  useEffect(() => {
    const reconcileCurrentSessionLastUsed = async () => {
      const updated = await syncCurrentSessionLastUsed();
      if (updated.antigravityAccounts)
        setAntigravityAccountsRef.current(updated.antigravityAccounts);
      if (updated.codexAccounts) setCodexAccountsRef.current(updated.codexAccounts);
    };

    const refreshVisibleIdlePlatforms = () => {
      void reconcileCurrentSessionLastUsed();
      const fetchAccountUsage = (acc: any) => fetchAccountUsageRef.current(acc);
      const maybeAutoFailoverActiveCodexPool = () => maybeAutoFailoverActiveCodexPoolRef.current();
      const refreshAntigravityAccountsCloudFirst = (accs: any, force?: boolean) =>
        refreshAntigravityAccountsCloudFirstRef.current(accs, force);

      if (platformVisibility.codex) {
        Promise.all(loadCodexAccounts().map((acc) => fetchAccountUsage(acc)))
          .then(maybeAutoFailoverActiveCodexPool)
          .catch(console.error);
      }
      if (platformVisibility.antigravity) {
        refreshAntigravityAccountsCloudFirst(loadAntigravityAccounts(), false).catch(console.error);
      }
    };
    void reconcileCurrentSessionLastUsed();
    const timer = window.setInterval(
      refreshVisibleIdlePlatforms,
      Math.max(5000, idlePollInterval * 1000),
    );
    return () => window.clearInterval(timer);
  }, [idlePollInterval, platformVisibility.codex, platformVisibility.antigravity]);

  useEffect(() => {
    const refreshMonitoredAccount = () => {
      const refreshTrackedAccountOnly = (payload: any) =>
        refreshTrackedAccountOnlyRef.current(payload);
      const savedProvider = localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY);
      const savedAccountId = localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY);

      // Claude scheduled polling is owned by useClaudeAccountMonitor with its own adaptive cadence
      if (savedProvider === "claude") return;

      const provider =
        savedProvider === "antigravity" && platformVisibility.antigravity
          ? "antigravity"
          : savedProvider === "codex" && platformVisibility.codex
            ? "codex"
            : platformVisibility.antigravity
              ? "antigravity"
              : platformVisibility.codex
                ? "codex"
                : null;

      if (!provider) return;

      refreshTrackedAccountOnly({
        provider,
        accountId: savedAccountId,
        force: false,
        maxAgeMs: pollInterval * 1000,
      }).catch(console.error);
    };
    const timer = window.setInterval(refreshMonitoredAccount, Math.max(5000, pollInterval * 1000));
    return () => window.clearInterval(timer);
  }, [
    pollInterval,
    platformVisibility.antigravity,
    platformVisibility.codex,
    platformVisibility.claude,
  ]);
}
