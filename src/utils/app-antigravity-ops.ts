import { invoke } from "@tauri-apps/api/core";
import { deobfuscate, obfuscate, fetchGoogleUserInfo } from "./auth";
import {
  AntigravityAccount,
  AntigravityAccountUsage,
  AntigravityUsageCacheEntry,
  ExactAntigravityAccountRequest,
  ExactAntigravityAccountResult,
} from "./types";
import { buildExactRequest, markCloudFallback, mergeExactResult } from "./antigravity-exact";
import { isUsageCacheFresh } from "./account-selection";
import { resolveAntigravityPlanName } from "./app-constants";
import { saveAntigravityAccounts } from "./app-storage";

export const applyExactResultToAccount = (
  result: ExactAntigravityAccountResult,
  setAntigravityAccounts: React.Dispatch<React.SetStateAction<AntigravityAccount[]>>,
): void => {
  if (result.state !== "exact" || !result.status) return;
  const status = result.status;
  setAntigravityAccounts((previous) => {
    const updated = previous.map((account) =>
      account.id === result.accountId
        ? {
            ...account,
            email: status.email || account.email,
            lastPlan: resolveAntigravityPlanName(status.planTier) || account.lastPlan,
            lastBalance: status.credits
              ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                  status.credits.balance,
                )
              : account.lastBalance,
            quotas: status.quotas,
            lastQuotaFetchedAt: Date.now(),
          }
        : account,
    );
    saveAntigravityAccounts(updated);
    return updated;
  });
};

export const fetchAntigravityAccountQuota = async (
  acc: AntigravityAccount,
  force = false,
  asFallback = false,
  cacheRef: React.MutableRefObject<Record<string, AntigravityUsageCacheEntry>>,
  setCache: React.Dispatch<React.SetStateAction<Record<string, AntigravityUsageCacheEntry>>>,
  setAccounts: React.Dispatch<React.SetStateAction<AntigravityAccount[]>>,
): Promise<AntigravityUsageCacheEntry> => {
  if (!force && isUsageCacheFresh(cacheRef.current[acc.id])) {
    return cacheRef.current[acc.id];
  }

  try {
    const rawToken = deobfuscate(acc.token);
    const rawRefreshToken = acc.refreshToken ? deobfuscate(acc.refreshToken) : undefined;
    const usageResult = await invoke<AntigravityAccountUsage>("fetch_antigravity_account_usage", {
      accessToken: rawToken,
      refreshToken: rawRefreshToken ?? null,
      authMethod: acc.authMethod ?? null,
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
    let fetchedProfileUrl: string | undefined;
    if (!email || !acc.profileUrl) {
      try {
        const userInfo = await fetchGoogleUserInfo(activeToken);
        if (userInfo?.email) email = userInfo.email;
        if (userInfo?.picture) fetchedProfileUrl = userInfo.picture;
      } catch (error) {
        console.warn("Google UserInfo was unavailable for Antigravity fallback", error);
      }
    }

    setAccounts((previous) => {
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
              profileUrl: fetchedProfileUrl ? obfuscate(fetchedProfileUrl) : account.profileUrl,
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
    const prior = cacheRef.current[acc.id];
    const returnedEntry: AntigravityUsageCacheEntry = asFallback
      ? markCloudFallback(prior, cloudEntry)
      : {
          ...prior,
          ...cloudEntry,
          source:
            usageResult.accuracy === "exact_grouped"
              ? "cloud"
              : prior?.source === "exact" || prior?.source === "cached_exact"
                ? prior.source
                : "cloud",
        };
    cacheRef.current = { ...cacheRef.current, [acc.id]: returnedEntry };
    setCache((prev) => ({ ...prev, [acc.id]: returnedEntry }));
    return returnedEntry;
  } catch (err: any) {
    const failedEntry: AntigravityUsageCacheEntry = {
      loading: false,
      error: err?.message ?? String(err),
    };
    const prior = cacheRef.current[acc.id];
    const returnedEntry: AntigravityUsageCacheEntry = asFallback
      ? markCloudFallback(prior, failedEntry)
      : { ...prior, ...failedEntry };
    cacheRef.current = { ...cacheRef.current, [acc.id]: returnedEntry };
    setCache((prev) => ({ ...prev, [acc.id]: returnedEntry }));
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
  if (accounts.length === 0) return;
  const validRequests = accounts
    .map((account) => ({ account, request: buildExactRequest(account, deobfuscate) }))
    .filter(
      (entry): entry is { account: AntigravityAccount; request: ExactAntigravityAccountRequest } =>
        entry.request !== null,
    );
  const invalidAccounts = accounts.filter(
    (account) => !validRequests.some((entry) => entry.account.id === account.id),
  );

  setCache((previous) => {
    const next = { ...previous };
    for (const account of accounts) {
      next[account.id] = {
        ...next[account.id],
        loading: true,
        exactState: "preparing_profile",
        workerMessage: "Preparing exact quota refresh",
        error: undefined,
      };
    }
    return next;
  });

  for (const account of invalidAccounts) {
    const result: ExactAntigravityAccountResult = {
      accountId: account.id,
      state: "error",
      status: null,
      error: "Exact quota requires a captured account email and access token",
      fetchedAt: new Date().toISOString(),
    };
    setCache((previous) => ({
      ...previous,
      [account.id]: mergeExactResult(previous[account.id], result),
    }));
    if (allowCloudFallback) {
      await fetchAntigravityAccountQuota(account, true, true, cacheRef, setCache, setAccounts);
    }
  }

  if (validRequests.length === 0) return;
  let results: ExactAntigravityAccountResult[];
  try {
    results = await invoke<ExactAntigravityAccountResult[]>("refresh_antigravity_accounts_exact", {
      requests: validRequests.map((entry) => entry.request),
      persistent,
    });
  } catch (error: any) {
    results = validRequests.map(({ account }) => ({
      accountId: account.id,
      state: "error",
      status: null,
      error: error?.message ?? String(error),
      fetchedAt: new Date().toISOString(),
    }));
  }

  for (const result of results) {
    setCache((previous) => ({
      ...previous,
      [result.accountId]: mergeExactResult(previous[result.accountId], result),
    }));
    applyExactResultToAccount(result, setAccounts);
    if (result.state !== "exact" && allowCloudFallback) {
      const account = accounts.find((candidate) => candidate.id === result.accountId);
      if (account) {
        await fetchAntigravityAccountQuota(account, true, true, cacheRef, setCache, setAccounts);
      }
    }
  }
};

export const refreshAntigravityAccountsCloudFirst = async (
  accounts: AntigravityAccount[],
  force = true,
  persistent: boolean,
  cacheRef: React.MutableRefObject<Record<string, AntigravityUsageCacheEntry>>,
  setCache: React.Dispatch<React.SetStateAction<Record<string, AntigravityUsageCacheEntry>>>,
  setAccounts: React.Dispatch<React.SetStateAction<AntigravityAccount[]>>,
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
      ),
    })),
  );

  const exactFallbackAccounts = cloudResults
    .filter(({ result }) => result.error || result.accuracy !== "exact_grouped")
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
