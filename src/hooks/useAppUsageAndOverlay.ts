import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { OverlayAccountData } from "../components/overlay/OverlayApp";
import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  ClaudeAccountUsageStatus,
  CodexAccount,
  UseAppUsageAndOverlayParams,
} from "./useAppUsageAndOverlay.types";
import { buildMonitoredCodexInfo } from "../utils/codex/codex-tray-state";
import { buildTrackedClaudeOverlayPayload } from "../utils/common/app-overlay-helpers";
import { buildActiveOverlayData, readPreviousOverlayData } from "../utils/common/overlay-builder";
import { buildMonitoredTrayInfo } from "../utils/common/tray-usage";
import { useCodexUsageFetcher } from "./useCodexUsageFetcher";
import {
  OVERLAY_TRACKED_ACCOUNT_ID_KEY,
  OVERLAY_TRACKED_PROVIDER_KEY,
} from "../utils/common/app-constants";

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
    refreshLocalSessionQuota,
    syncLocalSessionFromDisk,
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

  const syncTrackedIdentityState = (
    provider: "antigravity" | "codex" | "claude",
    accountId: string | null,
  ) => {
    persistedTrackedProviderRef.current = provider;
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

  const handleTrackAntigravityAccount = async (acc: AntigravityAccount) => {
    syncTrackedIdentityState("antigravity", acc.id);
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "antigravity");
    localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, acc.id);
    await invoke("set_monitored_codex", { info: null });
    await refreshAntigravityAccountsCloudFirst([acc], true);
  };

  const handleTrackCodexAccount = async (acc: CodexAccount) => {
    syncTrackedIdentityState("codex", acc.id);
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "codex");
    localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, acc.id);
    const c = await fetchAccountUsage(acc, true);
    if (c)
      await invoke("set_monitored_codex", { info: buildMonitoredCodexInfo(acc, c) }).catch(
        console.warn,
      );
    return c;
  };

  const handleTrackClaude = async (status: ClaudeAccountUsageStatus) => {
    const accountId = status.account.id;
    syncTrackedIdentityState("claude", accountId);
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "claude");
    localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, accountId);
    await invoke("set_monitored_codex", { info: null });
    if (refreshClaudeAccountStatuses) {
      await refreshClaudeAccountStatuses(true).catch(() => {});
    }
  };

  const refreshTrackedAccountOnly = async (payload: any) => {
    const provider = payload?.provider || persistedTrackedProviderRef.current;
    const accountId = payload?.accountId ?? trackedAccountIdRef.current;
    const force = payload?.force ?? true;

    if (provider === "antigravity") {
      const isLocal = accountId === "local" || accountId === "local-antigravity-session";
      const targetAcc = isLocal
        ? undefined
        : (antigravityAccountsRef.current.find((a) => a.id === accountId) ??
          antigravityAccountsRef.current[0]);
      if (targetAcc) {
        await refreshAntigravityAccountsCloudFirst([targetAcc], force);
      } else if (syncLocalSessionFromDisk) {
        await syncLocalSessionFromDisk(force);
      } else if (refreshLocalSessionQuota) {
        await refreshLocalSessionQuota();
      }
    } else if (payload?.provider === "claude" || provider === "claude") {
      await refreshClaudeAccountStatuses?.(true);
    } else {
      const targetAcc =
        codexAccountsRef.current.find((a) => a.id === accountId) ?? codexAccountsRef.current[0];
      if (targetAcc) await fetchAccountUsage(targetAcc, force);
    }
    publishOverlayUpdate();
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
  ]);

  useEffect(() => {
    publishOverlayUpdate();
  }, [publishOverlayUpdate]);

  return {
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
    syncTrackedIdentityState,
    fetchAccountUsage,
    handleTrackAntigravityAccount,
    handleTrackCodexAccount,
    handleTrackClaude,
    refreshTrackedAccountOnly,
    publishOverlayUpdate,
  };
}
