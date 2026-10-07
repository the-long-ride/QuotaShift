import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AntigravityWorkerProgress, FullStatus } from "../../utils/common/types";
import { loadAntigravityAccounts, loadCodexAccounts } from "../../utils/common/app-storage";
import {
  OVERLAY_TRACKED_ACCOUNT_ID_KEY,
  OVERLAY_TRACKED_PROVIDER_KEY,
} from "../../utils/common/app-constants";
import { resolveTrackedProviderTab } from "../../utils/common/tracked-provider-tab";
import { syncCurrentSessionLastUsed } from "../../utils/account/current-session-last-used";
import {
  TRACKED_IDS_CHANGED_EVENT,
  isTrackedProvider,
  loadTrackedList,
  untrackAccount,
  type TrackedProvider,
} from "../../utils/common/tracked-accounts";
import { clearMonitoredOverlayState } from "./overlayTrackedExtras";
import {
  FOCUS_ACCOUNT_CARD_EVENT,
  type FocusAccountCardPayload,
  scrollToAccountCard,
} from "../../utils/common/account-card-scroll";
import { firstVisiblePlatform } from "../../utils/common/platform-visibility";
import type { UseAppEventListenersParams } from "./useAppEventListeners.types";
import { useAppEventListenersRefs } from "./useAppEventListenersRefs";

export type { UseAppEventListenersParams };

export function useAppEventListeners(params: UseAppEventListenersParams) {
  const { pollInterval, idlePollInterval, platformVisibility } = params;
  const {
    onClearSearchRef,
    refreshTrackedAccountOnlyRef,
    platformVisibilityRef,
    fetchAccountUsageRef,
    refreshAntigravityAccountsCloudFirstRef,
    setActiveTabRef,
    setAntigravityUsageCacheRef,
    setLastFullStatusRef,
    updateLocalSessionFromStatusRef,
    setAntigravityAccountsRef,
    setCodexAccountsRef,
  } = useAppEventListenersRefs(params);

  useEffect(() => {
    let active = true;
    let unlistenStatus: (() => void) | null = null;
    let unlistenWindow: (() => void) | null = null;
    let unlistenWorker: (() => void) | null = null;
    let unlistenRefreshUsage: (() => void) | null = null;
    let unlistenFocusAccount: (() => void) | null = null;
    let unlistenUntrackAccount: (() => void) | null = null;

    const setupListeners = async () => {
      const uStatus = await listen<FullStatus | null>("status-updated", (event) => {
        setLastFullStatusRef.current(event.payload);
        updateLocalSessionFromStatusRef.current(event.payload as any);
      });
      if (!active) uStatus();
      else unlistenStatus = uStatus;

      // Payload is a tab id when opened from a specific overlay/taskbar account, else `true`.
      const uWindow = await listen<boolean | string>("window-shown", (event) => {
        const savedProvider = localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY);
        const visibility = platformVisibilityRef.current;
        const requested = event.payload;
        if (isTrackedProvider(requested) && visibility[requested]) {
          onClearSearchRef.current?.();
          setActiveTabRef.current(requested);
          return;
        }
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

      const uFocusAccount = await listen<FocusAccountCardPayload>(
        FOCUS_ACCOUNT_CARD_EVENT,
        (event) => {
          const { provider, accountId } = event.payload || {};
          const visibility = platformVisibilityRef.current;
          onClearSearchRef.current?.();
          if (isTrackedProvider(provider) && visibility[provider]) {
            setActiveTabRef.current(provider);
          }
          if (provider) {
            scrollToAccountCard(provider, accountId);
          }
        },
      );
      if (!active) uFocusAccount();
      else unlistenFocusAccount = uFocusAccount;

      const uUntrackAccount = await listen<{ provider: TrackedProvider; accountId: string }>(
        "request-untrack-account",
        (event) => {
          const { provider, accountId } = event.payload || {};
          if (isTrackedProvider(provider) && accountId) {
            const remaining = untrackAccount({ provider, id: accountId });
            if (remaining.length === 0) {
              clearMonitoredOverlayState();
            }
            window.dispatchEvent(new CustomEvent(TRACKED_IDS_CHANGED_EVENT));
          }
        },
      );
      if (!active) uUntrackAccount();
      else unlistenUntrackAccount = uUntrackAccount;

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
      unlistenFocusAccount?.();
      unlistenUntrackAccount?.();
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
      const refreshAntigravityAccountsCloudFirst = (accs: any, force?: boolean) =>
        refreshAntigravityAccountsCloudFirstRef.current(accs, force);

      if (platformVisibility.codex) {
        Promise.all(loadCodexAccounts().map((acc) => fetchAccountUsage(acc))).catch(console.error);
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
      const savedProvider = localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY);
      const savedAccountId = localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY);

      const refresh = (provider: string, accountId: string | null) =>
        refreshTrackedAccountOnlyRef
          .current({
            provider,
            accountId,
            force: false,
            maxAgeMs: pollInterval * 1000,
          })
          .catch(console.error);
      // Claude scheduled polling is owned by useClaudeAccountMonitor with its own adaptive cadence
      const listed = loadTrackedList().filter(
        (entry) => entry.provider !== "claude" && platformVisibility[entry.provider],
      );
      listed.forEach((entry) => refresh(entry.provider, entry.id));
      if (listed.length || savedProvider === "claude") return;

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

      refresh(provider, savedAccountId);
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
