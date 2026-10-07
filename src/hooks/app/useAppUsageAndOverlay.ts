import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  ClaudeAccountUsageStatus,
  CodexAccount,
  UseAppUsageAndOverlayParams,
} from "./useAppUsageAndOverlay.types";
import { buildMonitoredCodexInfo } from "../../utils/codex/codex-tray-state";
import { readPreviousOverlayData } from "../../utils/common/overlay-builder";
import { buildMonitoredTrayInfo } from "../../utils/common/tray-usage";
import { useCodexUsageFetcher } from "../codex/useCodexUsageFetcher";
import { useClaudeResetCredits } from "../claude/useClaudeResetCredits";
import { useTrackedAccountIds } from "./useTrackedAccountIds";
import { useTrackedIdentitySync } from "./useTrackedIdentitySync";
import {
  loadMultiTrackEnabled,
  toggleTrackedEntry,
  type TrackedProvider,
} from "../../utils/common/tracked-accounts";
import {
  attachTrackedExtras,
  clearMonitoredOverlayState,
  resolveFallbackClaudeAccountId,
  resolvePrimaryPayload,
} from "./overlayTrackedExtras";
import { createRefreshTrackedAccountOnly } from "./trackedAccountRefresh";
import {
  OVERLAY_TRACKED_ACCOUNT_ID_KEY,
  OVERLAY_TRACKED_PROVIDER_KEY,
} from "../../utils/common/app-constants";

export function useAppUsageAndOverlay(params: UseAppUsageAndOverlayParams) {
  const {
    antigravityAccounts,
    activeAntigravityId,
    codexAccounts,
    setCodexAccounts,
    activeCodexId,
    claudeMonitorStatus,
    claudeAccountStatuses,
    refreshClaudeAccountStatuses,
    lastFullStatus,
    refreshAntigravityAccountsCloudFirst,
    localAntigravitySession,
    notifyTrackStarted,
  } = params;
  const antigravityAccountsRef = useRef(antigravityAccounts);
  antigravityAccountsRef.current = antigravityAccounts;
  const codexAccountsRef = useRef(codexAccounts);
  codexAccountsRef.current = codexAccounts;
  const { trackedList, trackedListRef, trackedIds, commitTrackedList, ensureTracked } =
    useTrackedAccountIds(notifyTrackStarted);

  const {
    trackedProvider,
    setTrackedProvider,
    trackedAccountId,
    setTrackedAccountId,
    trackedProviderRef,
    trackedAccountIdRef,
    persistedTrackedProviderRef,
    syncTrackedIdentityState,
  } = useTrackedIdentitySync(ensureTracked);

  const [antigravityUsageCache, setAntigravityUsageCache] = useState<
    Record<string, AntigravityUsageCacheEntry>
  >({});

  const { codexUsageCache, setCodexUsageCache, codexUsageCacheRef, fetchAccountUsage } =
    useCodexUsageFetcher({
      setCodexAccounts,
      trackedProviderRef,
      trackedAccountIdRef,
    });

  const antigravityUsageCacheRef = useRef(antigravityUsageCache);
  antigravityUsageCacheRef.current = antigravityUsageCache;
  const { resetCredits, resetCreditsByAccountId, refreshResetCredits } = useClaudeResetCredits(
    trackedProvider ?? "antigravity",
    trackedAccountId,
    claudeAccountStatuses,
  );

  /**
   * Applies a double-click: replace (single mode) or add/remove across providers (multi, 1–3).
   * Returns true when the clicked account is the primary one (drives tray/monitor state).
   */
  const applyTrack = (provider: TrackedProvider, accountId: string) => {
    const entry = { provider, id: accountId };
    const result = toggleTrackedEntry(trackedListRef.current, entry, loadMultiTrackEnabled());
    commitTrackedList(result.list);
    const primary = result.list[0] ?? null;
    if (primary) {
      syncTrackedIdentityState(primary.provider, primary.id);
      localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, primary.provider);
      localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, primary.id);
    } else {
      syncTrackedIdentityState(provider, null);
      clearMonitoredOverlayState();
    }
    return primary ? primary.provider === provider && primary.id === accountId : false;
  };

  const handleTrackAntigravityAccount = async (acc: AntigravityAccount) => {
    if (applyTrack("antigravity", acc.id)) await invoke("set_monitored_codex", { info: null });
    await refreshAntigravityAccountsCloudFirst([acc], true);
  };

  const handleTrackCodexAccount = async (acc: CodexAccount) => {
    const isPrimary = applyTrack("codex", acc.id);
    const c = await fetchAccountUsage(acc, true);
    if (c && isPrimary)
      await invoke("set_monitored_codex", { info: buildMonitoredCodexInfo(acc, c) }).catch(
        console.warn,
      );
    return c;
  };

  const handleTrackClaude = async (status: ClaudeAccountUsageStatus) => {
    if (applyTrack("claude", status.account.id))
      await invoke("set_monitored_codex", { info: null });
    if (refreshClaudeAccountStatuses) {
      await refreshClaudeAccountStatuses(true).catch(() => {});
    }
  };

  const publishOverlayUpdate = useCallback(() => {
    const prevOverlayData = readPreviousOverlayData();
    const savedTrackedProvider = persistedTrackedProviderRef.current;
    let savedTrackedAccountId = trackedAccountIdRef.current;
    const isClaudeTracked = savedTrackedProvider === "claude";
    if (
      isClaudeTracked &&
      (!savedTrackedAccountId || savedTrackedAccountId === "claude-local") &&
      claudeAccountStatuses.length
    ) {
      const fallbackId = resolveFallbackClaudeAccountId(claudeAccountStatuses);
      if (fallbackId) {
        savedTrackedAccountId = fallbackId;
        syncTrackedIdentityState("claude", savedTrackedAccountId);
        localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "claude");
        localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, savedTrackedAccountId);
      }
    }
    const isCodexTracked =
      savedTrackedProvider === "codex" ||
      (savedTrackedProvider !== "antigravity" &&
        savedTrackedProvider !== "claude" &&
        Boolean(lastFullStatus?.monitoredCodex));

    if (!trackedListRef.current.length) {
      clearMonitoredOverlayState();
      return;
    }

    let payload = resolvePrimaryPayload({
      isClaudeTracked,
      isCodexTracked,
      savedTrackedProvider,
      savedTrackedAccountId,
      claudeAccountStatuses,
      claudeMonitorStatus,
      prevOverlayData,
      resetCredits,
      params,
      antigravityUsageCache,
      codexUsageCache,
      localAntigravitySession,
      syncTrackedIdentityState,
    });

    payload = attachTrackedExtras(payload, trackedListRef.current, {
      params,
      antigravityUsageCache,
      codexUsageCache,
      resetCreditsByAccountId,
    });

    void invoke("set_monitored_tray", { info: buildMonitoredTrayInfo(payload) }).catch(
      console.warn,
    );

    emit("overlay-data-update", payload);
    localStorage.setItem("quotashift_overlay_data", JSON.stringify(payload));
  }, [
    antigravityAccounts,
    codexAccounts,
    activeAntigravityId,
    activeCodexId,
    antigravityUsageCache,
    codexUsageCache,
    claudeMonitorStatus,
    claudeAccountStatuses,
    lastFullStatus,
    localAntigravitySession,
    resetCredits,
    resetCreditsByAccountId,
    trackedList,
  ]);

  useEffect(() => {
    publishOverlayUpdate();
  }, [publishOverlayUpdate]);

  const refreshTrackedAccountOnly = createRefreshTrackedAccountOnly({
    params,
    persistedTrackedProviderRef,
    trackedAccountIdRef,
    antigravityAccountsRef,
    codexAccountsRef,
    fetchAccountUsage,
    refreshResetCredits,
    publishOverlayUpdate,
  });

  return {
    trackedIds,
    trackedProvider,
    setTrackedProvider,
    trackedAccountId,
    setTrackedAccountId,
    antigravityUsageCache,
    setAntigravityUsageCache,
    codexUsageCache,
    setCodexUsageCache,
    antigravityUsageCacheRef,
    codexUsageCacheRef,
    resetCreditsByAccountId,
    refreshResetCredits,
    syncTrackedIdentityState,
    fetchAccountUsage,
    handleTrackAntigravityAccount,
    handleTrackCodexAccount,
    handleTrackClaude,
    refreshTrackedAccountOnly,
    publishOverlayUpdate,
  };
}
