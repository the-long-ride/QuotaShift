import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CodexAccount } from "../utils/common/types";
import { deobfuscate, obfuscate, decodeJwtProfile } from "../utils/auth/auth";
import { isUsageCacheFresh } from "../utils";
import {
  loadCodexAccounts,
  loadCodexUsageCache,
  saveCodexAccounts,
  saveCodexUsageEntry,
} from "../utils/common/app-storage";
import { fetchCodexUsageData } from "../utils/codex/app-codex-ops";
import {
  applyDetectedCodexPlan,
  normalizeDetectedCodexPlan,
} from "../utils/codex/codex-account-plan";
import { buildMonitoredCodexInfo, shouldSyncTrackedCodex } from "../utils/codex/codex-tray-state";
import {
  accountErrorText,
  isAccountReauthenticationError,
} from "../utils/account/account-auth-error";
import {
  ACCOUNT_POLL_SUSPENDED_ERROR,
  isAccountPollingSuspended,
  suspendAccountPolling,
} from "../utils/account/account-poll-suspension";
import { extractCodexProfilePicture } from "../utils/codex/codex-profile";
import { loadTrackedPollIntervalPreference } from "../utils/common/poll-interval";

export interface UseCodexUsageFetcherParams {
  setCodexAccounts: (accs: CodexAccount[]) => void;
  trackedProviderRef: React.MutableRefObject<"antigravity" | "codex" | "claude">;
  trackedAccountIdRef: React.MutableRefObject<string | null>;
}

export function useCodexUsageFetcher({
  setCodexAccounts,
  trackedProviderRef,
  trackedAccountIdRef,
}: UseCodexUsageFetcherParams) {
  const [codexUsageCache, setCodexUsageCache] = useState<Record<string, any>>(() =>
    loadCodexUsageCache(),
  );
  const codexUsageCacheRef = useRef(codexUsageCache);
  codexUsageCacheRef.current = codexUsageCache;
  const avatarLookupAttemptedRef = useRef<Set<string>>(new Set());
  const inFlightUsageRef = useRef<Map<string, Promise<any>>>(new Map());

  const publishUsageEntry = (accountId: string, entry: any) => {
    const next = { ...codexUsageCacheRef.current, [accountId]: entry };
    codexUsageCacheRef.current = next;
    setCodexUsageCache(next);
  };

  const commitUsageEntry = (accountId: string, entry: any) => {
    publishUsageEntry(accountId, entry);
    saveCodexUsageEntry(accountId, entry);
  };

  const cacheAvatarIfMissing = async (account: CodexAccount, oauthData: any) => {
    if (account.profileUrl || avatarLookupAttemptedRef.current.has(account.id)) return;
    avatarLookupAttemptedRef.current.add(account.id);

    const tokenProfile = decodeJwtProfile(oauthData.idToken || oauthData.accessToken);
    let picture = tokenProfile?.picture || null;
    if (!picture) {
      try {
        const remoteProfile = await invoke<any>("fetch_chatgpt_profile", {
          accessToken: oauthData.accessToken,
        });
        picture = extractCodexProfilePicture(remoteProfile);
      } catch {
        return;
      }
    }
    if (!picture) return;

    const profileUrl = obfuscate(picture);
    const current = loadCodexAccounts();
    const next = current.map((item) =>
      item.id === account.id && !item.profileUrl ? { ...item, profileUrl } : item,
    );
    if (next.every((item, index) => item === current[index])) return;
    saveCodexAccounts(next);
    setCodexAccounts(next);
  };

  const persistDetectedPlan = (accountId: string, planName: unknown) => {
    const current = loadCodexAccounts();
    const next = applyDetectedCodexPlan(current, accountId, planName);
    if (next === current) return;
    saveCodexAccounts(next);
    setCodexAccounts(next);
  };

  const syncTrackedCodexUsage = async (account: CodexAccount, usage: any) => {
    if (
      !shouldSyncTrackedCodex(trackedProviderRef.current, trackedAccountIdRef.current, account.id)
    )
      return;
    await invoke("set_monitored_codex", { info: buildMonitoredCodexInfo(account, usage) }).catch(
      console.warn,
    );
  };

  const fetchAccountUsage = async (account: CodexAccount, force = false): Promise<any> => {
    const existingRequest = inFlightUsageRef.current.get(account.id);
    if (existingRequest) return existingRequest;

    if (!force && isAccountPollingSuspended("codex", account.id)) {
      const prior = codexUsageCacheRef.current[account.id] || {};
      const paused = {
        ...prior,
        loading: false,
        error: prior.error || ACCOUNT_POLL_SUSPENDED_ERROR,
      };
      publishUsageEntry(account.id, paused);
      return paused;
    }
    const isTracked =
      trackedProviderRef.current === "codex" && trackedAccountIdRef.current === account.id;
    const maxAgeMs = isTracked
      ? Math.max(5000, loadTrackedPollIntervalPreference() * 1000)
      : undefined;
    if (!force && isUsageCacheFresh(codexUsageCacheRef.current[account.id], maxAgeMs))
      return codexUsageCacheRef.current[account.id];

    const prior = codexUsageCacheRef.current[account.id] || {};
    publishUsageEntry(account.id, { ...prior, loading: true, error: undefined });

    const request = (async () => {
      try {
        const rawKey = deobfuscate(account.apiKey);
        if (rawKey.startsWith("{")) {
          const oauthData = JSON.parse(rawKey);
          if (!account.profileUrl) void cacheAvatarIfMissing(account, oauthData);
          const tokenEmail = decodeJwtProfile(oauthData.idToken || oauthData.accessToken)?.email;
          const accountEmail = oauthData.email || account.email || tokenEmail || null;
          const usageData = await invoke<any>("fetch_chatgpt_usage", {
            accessToken: oauthData.accessToken,
            accountId: oauthData.accountId,
            email: accountEmail,
          });
          const limits = usageData.rate_limit || {};
          const primary = limits.primary_window || null;
          const secondary = limits.secondary_window || limits.weekly_window || null;
          const monthly = limits.monthly_window || limits.month_window || null;
          const planName = normalizeDetectedCodexPlan(usageData.plan_type);
          const entry = {
            loading: false,
            fetchedAt: Date.now(),
            isOAuth: true,
            planName,
            primary,
            secondary,
            monthly,
            rate_limit: limits,
            error: undefined,
          };
          commitUsageEntry(account.id, entry);
          persistDetectedPlan(account.id, planName);
          await syncTrackedCodexUsage(account, entry);
          return entry;
        }
        const snapshot = await fetchCodexUsageData(rawKey);
        const planName = normalizeDetectedCodexPlan(snapshot.planName);
        const entry = {
          loading: false,
          fetchedAt: Date.now(),
          isOAuth: false,
          planName,
          snapshot,
          error: undefined,
        };
        commitUsageEntry(account.id, entry as any);
        persistDetectedPlan(account.id, planName);
        await syncTrackedCodexUsage(account, entry);
        return entry;
      } catch (error) {
        const errorText = accountErrorText(error) || "Codex usage refresh failed";
        if (isAccountReauthenticationError(error)) suspendAccountPolling("codex", account.id);
        const previous = codexUsageCacheRef.current[account.id] || {};
        const failed = {
          ...previous,
          loading: false,
          error: errorText,
        };
        publishUsageEntry(account.id, failed);
        return null;
      } finally {
        inFlightUsageRef.current.delete(account.id);
      }
    })();

    inFlightUsageRef.current.set(account.id, request);
    return request;
  };

  return {
    codexUsageCache,
    setCodexUsageCache,
    codexUsageCacheRef,
    fetchAccountUsage,
    syncTrackedCodexUsage,
    persistDetectedPlan,
  };
}
