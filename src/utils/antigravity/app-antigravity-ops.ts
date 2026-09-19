import { invoke } from "@tauri-apps/api/core";
import { deobfuscate, obfuscate, fetchGoogleUserInfo } from "../auth/auth";
import {
  AntigravityAccount,
  AntigravityAccountUsage,
  AntigravityUsageCacheEntry,
} from "../common/types";
import { markCloudFallback } from "./antigravity-exact";
import { isUsageCacheFresh } from "../account/account-selection";
import { resolveAntigravityPlanName } from "../common/app-constants";
import { saveAntigravityAccounts } from "../common/app-storage";
import { resolveRefreshedAvatarUrl } from "../account/account-avatar";
import { isAccountReauthenticationError } from "../account/account-auth-error";
import {
  ACCOUNT_POLL_SUSPENDED_ERROR,
  isAccountPollingSuspended,
  suspendAccountPolling,
} from "../account/account-poll-suspension";
import { loadTrackedPollIntervalPreference } from "../common/poll-interval";

export { applyExactResultToAccount } from "./antigravity-exact-ops.js";
import { refreshExactAntigravityAccounts as refreshExactInternal } from "./antigravity-exact-ops.js";

export const fetchAntigravityAccountQuota = async (
  acc: AntigravityAccount,
  force = false,
  asFallback = false,
  cacheRef?: React.MutableRefObject<Record<string, AntigravityUsageCacheEntry>>,
  setCache?: React.Dispatch<React.SetStateAction<Record<string, AntigravityUsageCacheEntry>>>,
  setAccounts?: React.Dispatch<React.SetStateAction<AntigravityAccount[]>>,
  maxAgeMs?: number,
): Promise<AntigravityUsageCacheEntry> => {
  if (!force && isAccountPollingSuspended("antigravity", acc.id)) {
    const prior = cacheRef?.current ? cacheRef.current[acc.id] : undefined;
    const paused: AntigravityUsageCacheEntry = {
      ...prior,
      loading: false,
      error: prior?.error || ACCOUNT_POLL_SUSPENDED_ERROR,
    };
    if (cacheRef?.current) cacheRef.current = { ...cacheRef.current, [acc.id]: paused };
    setCache?.((prev) => ({ ...prev, [acc.id]: paused }));
    return paused;
  }
  const isTracked =
    localStorage.getItem("quotashift_overlay_tracked_provider") === "antigravity" &&
    localStorage.getItem("quotashift_overlay_tracked_account_id") === acc.id;
  const effectiveMaxAge =
    maxAgeMs ??
    (isTracked ? Math.max(5000, loadTrackedPollIntervalPreference() * 1000) : undefined);
  if (!force && cacheRef?.current && isUsageCacheFresh(cacheRef.current[acc.id], effectiveMaxAge)) {
    return cacheRef.current[acc.id];
  }

  try {
    const rawToken = deobfuscate(acc.token);
    const rawRefreshToken = acc.refreshToken ? deobfuscate(acc.refreshToken) : undefined;
    const usageResult = await invoke<AntigravityAccountUsage>("fetch_antigravity_account_usage", {
      accessToken: rawToken,
      refreshToken: rawRefreshToken ?? null,
      authMethod: acc.authMethod ?? null,
      email: acc.email ?? null,
    });

    let activeToken = rawToken;
    let newAccessToken: string | undefined;
    let newRefreshToken: string | undefined;
    if (usageResult.refreshedTokens) {
      newAccessToken = usageResult.refreshedTokens.accessToken;
      newRefreshToken = usageResult.refreshedTokens.refreshToken;
      if (newAccessToken) activeToken = newAccessToken;
    }

    let email = acc.email;
    let fetchedProfileUrl = acc.profileUrl;
    try {
      const userInfo = await fetchGoogleUserInfo(activeToken);
      if (userInfo?.email) email = userInfo.email;
      if (userInfo?.picture) {
        fetchedProfileUrl = resolveRefreshedAvatarUrl(
          acc.profileUrl,
          userInfo.picture,
          deobfuscate,
          obfuscate,
        );
      }
    } catch (error) {
      console.warn("Google UserInfo was unavailable for Antigravity refresh", error);
    }

    setAccounts?.((previous) => {
      const updated = previous.map((account) =>
        account.id === acc.id
          ? {
              ...account,
              token: newAccessToken ? obfuscate(newAccessToken) : account.token,
              refreshToken: newRefreshToken ? obfuscate(newRefreshToken) : account.refreshToken,
              authMethod: usageResult.refreshedTokens?.authMethod || account.authMethod,
              cloudQuotas: usageResult.quotas?.length ? usageResult.quotas : account.cloudQuotas,
              lastPlan:
                resolveAntigravityPlanName(usageResult.planTier) || account.lastPlan || "Gemini AI",
              email: email || account.email,
              profileUrl: fetchedProfileUrl || account.profileUrl,
              lastQuotaFetchedAt: Date.now(),
            }
          : account,
      );
      saveAntigravityAccounts(updated);
      return updated;
    });

    const cloudEntry: AntigravityUsageCacheEntry = {
      loading: false,
      exactState: "idle",
      workerMessage:
        usageResult.accuracy === "exact_grouped"
          ? "Remote grouped quota refreshed"
          : "Remote session quota refreshed",
      cloudQuotas: usageResult.quotas,
      planTier: usageResult.planTier,
      email: email ?? null,
      accuracy: usageResult.accuracy,
      fetchedAt: Date.now(),
      source: "cloud",
      error: undefined,
    };
    const prior = cacheRef?.current ? cacheRef.current[acc.id] : undefined;
    const returnedEntry: AntigravityUsageCacheEntry = asFallback
      ? markCloudFallback(prior, cloudEntry)
      : {
          ...prior,
          ...cloudEntry,
          error: undefined,
          source:
            usageResult.accuracy === "exact_grouped"
              ? "cloud"
              : prior?.source === "exact" || prior?.source === "cached_exact"
                ? prior.source
                : "cloud",
        };
    if (cacheRef?.current) cacheRef.current = { ...cacheRef.current, [acc.id]: returnedEntry };
    setCache?.((prev) => ({ ...prev, [acc.id]: returnedEntry }));
    return returnedEntry;
  } catch (err: any) {
    if (isAccountReauthenticationError(err)) suspendAccountPolling("antigravity", acc.id);
    const failedEntry: AntigravityUsageCacheEntry = {
      loading: false,
      error: err?.message ?? String(err),
    };
    const prior = cacheRef?.current ? cacheRef.current[acc.id] : undefined;
    const returnedEntry: AntigravityUsageCacheEntry = asFallback
      ? markCloudFallback(prior, failedEntry)
      : { ...prior, ...failedEntry };
    if (cacheRef?.current) cacheRef.current = { ...cacheRef.current, [acc.id]: returnedEntry };
    setCache?.((prev) => ({ ...prev, [acc.id]: returnedEntry }));
    return returnedEntry;
  }
};

export const refreshExactAntigravityAccounts = async (
  accounts: AntigravityAccount[],
  allowCloudFallback: boolean,
  persistent: boolean,
  cacheRef: React.MutableRefObject<Record<string, AntigravityUsageCacheEntry>>,
  setCache: React.Dispatch<React.SetStateAction<Record<string, AntigravityUsageCacheEntry>>>,
  setAccounts: React.Dispatch<React.SetStateAction<AntigravityAccount[]>>,
): Promise<void> => {
  return refreshExactInternal(
    accounts,
    allowCloudFallback,
    persistent,
    cacheRef,
    setCache,
    setAccounts,
    fetchAntigravityAccountQuota,
  );
};

export const refreshAntigravityAccountsCloudFirst = async (
  accounts: AntigravityAccount[],
  force = true,
  persistent: boolean,
  cacheRef: React.MutableRefObject<Record<string, AntigravityUsageCacheEntry>>,
  setCache: React.Dispatch<React.SetStateAction<Record<string, AntigravityUsageCacheEntry>>>,
  setAccounts: React.Dispatch<React.SetStateAction<AntigravityAccount[]>>,
  maxAgeMs?: number,
): Promise<void> => {
  if (accounts.length === 0) return;

  const cloudResults = await Promise.all(
    accounts.map(async (account) => ({
      account,
      result: await fetchAntigravityAccountQuota(
        account,
        force,
        false,
        cacheRef,
        setCache,
        setAccounts,
        maxAgeMs,
      ),
    })),
  );

  const exactFallbackAccounts = cloudResults
    .filter(
      ({ account, result }) =>
        !isAccountPollingSuspended("antigravity", account.id) &&
        (result.error || result.accuracy !== "exact_grouped"),
    )
    .map(({ account }) => account);

  if (exactFallbackAccounts.length > 0) {
    await refreshExactAntigravityAccounts(
      exactFallbackAccounts,
      false,
      persistent,
      cacheRef,
      setCache,
      setAccounts,
    );
  }
};
