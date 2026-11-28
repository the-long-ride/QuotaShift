import { invoke } from "@tauri-apps/api/core";
import { deobfuscate } from "../../auth/auth";
import {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  ExactAntigravityAccountRequest,
  ExactAntigravityAccountResult,
} from "../../common/types";
import { buildExactRequest, mergeExactResult } from "./antigravity-exact";
import { resolvePreservedAntigravityTier } from "./antigravity-tier-summary.js";
import { resolveAntigravityPlanName } from "../../common/backup/app-constants";
import { saveAntigravityAccounts } from "../../common/backup/app-storage";
import { resumeAccountPolling } from "../../account/capture/account-poll-suspension";
import { extractAntigravitySessionAccount } from "../current-local-session";
import { findAntigravityAccountMatch } from "../../account/current-account";

export const applyExactResultToAccount = (
  result: ExactAntigravityAccountResult,
  setAntigravityAccounts: React.Dispatch<React.SetStateAction<AntigravityAccount[]>>,
): void => {
  if (result.state !== "exact" || !result.status) return;
  const status = result.status;
  const fetchedAt = Date.now();
  setAntigravityAccounts((previous) => {
    const updated = previous.map((account) => {
      if (account.id !== result.accountId) return account;
      const resolvedTier = resolvePreservedAntigravityTier({
        incomingPlan: status.planTier,
        incomingPremiumModels: status.premiumModels ?? null,
        previousPlan: account.lastPlan,
        previousPremiumModels: account.premiumModels ?? null,
        preserveOnEmpty: true,
        previousObservedAt: account.lastQuotaFetchedAt ?? null,
        now: fetchedAt,
      });
      return {
        ...account,
        email: status.email || account.email,
        lastPlan: resolveAntigravityPlanName(resolvedTier.planTier) || account.lastPlan,
        premiumModels: resolvedTier.premiumModels,
        lastBalance: status.credits
          ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
              status.credits.balance,
            )
          : account.lastBalance,
        quotas: status.quotas,
        lastQuotaFetchedAt: fetchedAt,
      };
    });
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

  // The exact-quota worker uses the local IDE session. Never launch it for an
  // account that is merely saved, monitored, or fetched remotely.
  let appliedAccountId: string | null = null;
  try {
    const session = await invoke<Record<string, unknown> | null>("read_antigravity_session");
    const current = extractAntigravitySessionAccount(session);
    if (current) appliedAccountId = findAntigravityAccountMatch(accounts, current)?.id ?? null;
  } catch {
    // Missing/inaccessible device session must fail closed to cloud-only quota.
  }
  const appliedAccounts = accounts.filter((account) => account.id === appliedAccountId);
  if (appliedAccounts.length === 0) {
    if (allowCloudFallback && fetchQuotaFn) {
      for (const account of accounts)
        await fetchQuotaFn(account, true, true, cacheRef, setCache, setAccounts);
    }
    return;
  }
  const validRequests = appliedAccounts
    .map((account) => ({ account, request: buildExactRequest(account, deobfuscate) }))
    .filter(
      (entry): entry is { account: AntigravityAccount; request: ExactAntigravityAccountRequest } =>
        entry.request !== null,
    );
  const invalidAccounts = appliedAccounts.filter(
    (account) => !validRequests.some((entry) => entry.account.id === account.id),
  );

  setCache((previous) => {
    const next = { ...previous };
    for (const account of appliedAccounts) {
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
