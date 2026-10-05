import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { OverlayAccountData } from "../../components/overlay/OverlayApp";
import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  ClaudeAccountUsageStatus,
  CodexAccount,
  UseAppUsageAndOverlayParams,
} from "./useAppUsageAndOverlay.types";
import { buildMonitoredCodexInfo } from "../../utils/codex/codex-tray-state";
import { buildTrackedClaudeOverlayPayload } from "../../utils/common/app-overlay-helpers";
import {
  buildActiveOverlayData,
  readPreviousOverlayData,
} from "../../utils/common/overlay-builder";
import { buildMonitoredTrayInfo } from "../../utils/common/tray-usage";
import { useCodexUsageFetcher } from "../codex/useCodexUsageFetcher";
import { useClaudeResetCredits } from "../claude/useClaudeResetCredits";
import { useTrackedAccountIds } from "./useTrackedAccountIds";
import {
  loadMultiTrack,
  toggleTrackedAccount,
  type TrackedProvider,
} from "../../utils/common/tracked-accounts";
import { attachTrackedExtras } from "./overlayTrackedExtras";
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
    notifyTrackLimit,
  } = params;
  const antigravityAccountsRef = useRef(antigravityAccounts);
  antigravityAccountsRef.current = antigravityAccounts;
  const codexAccountsRef = useRef(codexAccounts);
  codexAccountsRef.current = codexAccounts;
  const [trackedProvider, setTrackedProvider] = useState<"antigravity" | "codex" | "claude">(
    () => (localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY) as any) || "antigravity",
  );
  const [trackedAccountId, setTrackedAccountId] = useState<string | null>(() =>
    localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY),
  );
  const [antigravityUsageCache, setAntigravityUsageCache] = useState<
    Record<string, AntigravityUsageCacheEntry>
  >({});

  const trackedProviderRef = useRef(trackedProvider);
  trackedProviderRef.current = trackedProvider;
  const trackedAccountIdRef = useRef(trackedAccountId);
  trackedAccountIdRef.current = trackedAccountId;
  const persistedTrackedProviderRef = useRef<string | null>(
    localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY),
  );
  const { trackedIds, trackedIdsRef, commitTrackedIds, ensureTracked } = useTrackedAccountIds();

  const syncTrackedIdentityState = (
    provider: "antigravity" | "codex" | "claude",
    accountId: string | null,
  ) => {
    persistedTrackedProviderRef.current = provider;
    ensureTracked(provider, accountId);
    if (trackedProviderRef.current !== provider) {
      trackedProviderRef.current = provider;
      setTrackedProvider(provider);
    }
    if (trackedAccountIdRef.current !== accountId) {
      trackedAccountIdRef.current = accountId;
      setTrackedAccountId(accountId);
    }
  };

  const { codexUsageCache, setCodexUsageCache, codexUsageCacheRef, fetchAccountUsage } =
    useCodexUsageFetcher({
      setCodexAccounts,
      trackedProviderRef,
      trackedAccountIdRef,
    });

  const antigravityUsageCacheRef = useRef(antigravityUsageCache);
  antigravityUsageCacheRef.current = antigravityUsageCache;
  const { resetCredits, resetCreditsByAccountId, refreshResetCredits } = useClaudeResetCredits(
    trackedProvider,
    trackedAccountId,
    claudeAccountStatuses,
  );

  /** Applies a double-click: replace (single mode) or add/remove (multi mode, 1–3). */
  const applyTrack = (provider: TrackedProvider, accountId: string) => {
    const shown = (persistedTrackedProviderRef.current as TrackedProvider | null) ?? provider;
    const multi = loadMultiTrack()[provider];
    const result = toggleTrackedAccount(trackedIdsRef.current, shown, provider, accountId, multi);
    commitTrackedIds(result.ids);
    const primary = result.ids[result.shown][0] ?? accountId;
    syncTrackedIdentityState(result.shown, primary);
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, result.shown);
    localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, primary);
    if (result.result === "max") notifyTrackLimit?.("You can monitor up to 3 accounts at once");
    if (result.result === "min") notifyTrackLimit?.("At least one account must stay monitored");
    return result;
  };

  const handleTrackAntigravityAccount = async (acc: AntigravityAccount) => {
    applyTrack("antigravity", acc.id);
    await invoke("set_monitored_codex", { info: null });
    await refreshAntigravityAccountsCloudFirst([acc], true);
  };

  const handleTrackCodexAccount = async (acc: CodexAccount) => {
    applyTrack("codex", acc.id);
    const c = await fetchAccountUsage(acc, true);
    if (c)
      await invoke("set_monitored_codex", { info: buildMonitoredCodexInfo(acc, c) }).catch(
        console.warn,
      );
    return c;
  };

  const handleTrackClaude = async (status: ClaudeAccountUsageStatus) => {
    applyTrack("claude", status.account.id);
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
      const defaultAccount =
        claudeAccountStatuses.find(
          (status) => status.account.profileName.trim().toLowerCase() === "default",
        ) ?? claudeAccountStatuses[0];
      savedTrackedAccountId = defaultAccount.account.id;
      syncTrackedIdentityState("claude", savedTrackedAccountId);
      localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "claude");
      localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, savedTrackedAccountId);
    }
    const isCodexTracked =
      savedTrackedProvider === "codex" ||
      (savedTrackedProvider !== "antigravity" &&
        savedTrackedProvider !== "claude" &&
        Boolean(lastFullStatus?.monitoredCodex));

    let payload: OverlayAccountData;
    if (isClaudeTracked) {
      payload = buildTrackedClaudeOverlayPayload({
        trackedAccountId: savedTrackedAccountId,
        accountStatuses: claudeAccountStatuses,
        monitorStatus: claudeMonitorStatus,
        prev: prevOverlayData,
        resetCredits,
      });
    } else {
      const built = buildActiveOverlayData({
        ...params,
        savedTrackedProvider,
        savedTrackedAccountId,
        isCodexTracked,
        antigravityUsageCache,
        codexUsageCache,
        localAntigravitySession,
        prevOverlayData,
      });
      payload = built.payload;
      if (built.syncIdentity) {
        syncTrackedIdentityState(built.syncIdentity.provider, built.syncIdentity.accountId);
        localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, built.syncIdentity.provider);
        localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, built.syncIdentity.accountId);
      }
    }

    payload = attachTrackedExtras(payload, trackedIdsRef.current[payload.provider], {
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
    trackedIds,
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
