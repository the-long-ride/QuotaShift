import { invoke } from "@tauri-apps/api/core";
import { deobfuscate } from "../auth/auth";
import {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  ExactAntigravityAccountRequest,
  ExactAntigravityAccountResult,
} from "../common/types";
import { buildExactRequest, mergeExactResult } from "./antigravity-exact";
import { resolveAntigravityPlanName } from "../common/app-constants";
import { saveAntigravityAccounts } from "../common/app-storage";
import { resumeAccountPolling } from "../account/account-poll-suspension";

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

export const refreshExactAntigravityAccounts = async (
  accounts: AntigravityAccount[],
  allowCloudFallback: boolean,
  persistent: boolean,
  cacheRef: React.MutableRefObject<Record<string, AntigravityUsageCacheEntry>>,
  setCache: React.Dispatch<React.SetStateAction<Record<string, AntigravityUsageCacheEntry>>>,
  setAccounts: React.Dispatch<React.SetStateAction<AntigravityAccount[]>>,
  fetchQuotaFn?: (
    acc: AntigravityAccount,
    force?: boolean,
    asFallback?: boolean,
    cacheRef?: React.MutableRefObject<Record<string, AntigravityUsageCacheEntry>>,
    setCache?: React.Dispatch<React.SetStateAction<Record<string, AntigravityUsageCacheEntry>>>,
    setAccounts?: React.Dispatch<React.SetStateAction<AntigravityAccount[]>>,
  ) => Promise<AntigravityUsageCacheEntry>,
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
      [account.id]: mergeExactResult(previous[result.accountId], result),
    }));
    if (allowCloudFallback && fetchQuotaFn) {
      await fetchQuotaFn(account, true, true, cacheRef, setCache, setAccounts);
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
    if (result.state === "exact") resumeAccountPolling("antigravity", result.accountId);
    if (result.state !== "exact" && allowCloudFallback && fetchQuotaFn) {
      const account = accounts.find((candidate) => candidate.id === result.accountId);
      if (account) {
        await fetchQuotaFn(account, true, true, cacheRef, setCache, setAccounts);
      }
    }
  }
};
