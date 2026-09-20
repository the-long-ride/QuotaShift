import { isUsageCacheFresh } from "../account/account-selection.js";
import { classifyCodexTier, isCodexAccountOAuth } from "./codex-tier-summary.js";
import {
  normalizeCodexUsageWindows,
  type CodexUsageWindow,
  type CodexUsageWindowKind,
} from "./codex-usage-windows.js";
import type {
  CodexAccount,
  CodexAccountPool,
  CodexPoolCapacity,
  CodexPoolLaneCapacity,
} from "../common/types.js";

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function readUsedPercent(window: any): number | null {
  const value = window?.used_percent;
  return typeof value === "number" && Number.isFinite(value) ? clampPercent(value) : null;
}

function isFreshUsableCache(cache: any): boolean {
  return isUsageCacheFresh(cache);
}

export function normalizeCodexPools(value: unknown): CodexAccountPool[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const normalized: CodexAccountPool[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<CodexAccountPool>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const model = typeof candidate.model === "string" ? candidate.model.trim() : "";
    if (!id || !name || !model || seenIds.has(id)) continue;

    const accountIds = Array.isArray(candidate.accountIds)
      ? [
          ...new Set(
            candidate.accountIds
              .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
              .map((item) => item.trim()),
          ),
        ]
      : [];
    const modelSelectionMode =
      candidate.modelSelectionMode === "discovered" ? "discovered" : "manual";
    seenIds.add(id);
    normalized.push({
      id,
      name,
      model,
      accountIds,
      modelSelectionMode,
    });
  }

  return normalized;
}

export function reconcileCodexPools(
  pools: CodexAccountPool[],
  accounts: CodexAccount[],
): CodexAccountPool[] {
  const validIds = new Set(accounts.map((account) => account.id));
  return normalizeCodexPools(pools).map((pool) => ({
    ...pool,
    accountIds: pool.accountIds.filter((id) => validIds.has(id)),
  }));
}

function aggregateLane(
  pool: CodexAccountPool,
  accountsById: Map<string, CodexAccount>,
  usageCache: Record<string, any>,
  lane: "primary" | "secondary",
): CodexPoolLaneCapacity {
  let remainingPoints = 0;
  let capacityPoints = 0;
  let knownMembers = 0;
  let nextResetAt: number | null = null;

  for (const accountId of pool.accountIds) {
    if (!accountsById.has(accountId)) continue;
    const cache = usageCache[accountId];
    if (!isFreshUsableCache(cache) || cache.isOAuth !== true) continue;

    const window = lane === "primary" ? cache.primary : (cache.secondary ?? cache.monthly);
    const usedPercent = readUsedPercent(window);
    if (usedPercent == null) continue;

    const remaining = 100 - usedPercent;
    remainingPoints += remaining;
    capacityPoints += 100;
    knownMembers += 1;

    if (remaining <= 0) {
      const resetAt = window?.reset_at;
      if (typeof resetAt === "number" && Number.isFinite(resetAt)) {
        nextResetAt = nextResetAt == null ? resetAt : Math.min(nextResetAt, resetAt);
      }
    }
  }

  return {
    remainingPoints,
    capacityPoints,
    knownMembers,
    totalMembers: pool.accountIds.length,
    nextResetAt,
  };
}

export function aggregateCodexPoolCapacity(
  pool: CodexAccountPool,
  accounts: CodexAccount[],
  usageCache: Record<string, any>,
): CodexPoolCapacity {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  let oauthMembers = 0;
  let apiKeyMembers = 0;

  for (const accountId of pool.accountIds) {
    const account = accountsById.get(accountId);
    if (!account) continue;
    const cache = usageCache[accountId];
    if (isCodexAccountOAuth(account, cache)) oauthMembers += 1;
    else if (account.apiKey) apiKeyMembers += 1;
  }

  return {
    primary: aggregateLane(pool, accountsById, usageCache, "primary"),
    secondary: aggregateLane(pool, accountsById, usageCache, "secondary"),
    oauthMembers,
    apiKeyMembers,
  };
}

export interface CodexPoolRequiredFieldErrors {
  name?: string;
  model?: string;
  members?: string;
}

export function validateCodexPoolRequiredFields(
  name: string,
  model: string,
  accountIds: string[],
): CodexPoolRequiredFieldErrors {
  const errors: CodexPoolRequiredFieldErrors = {};
  if (!name.trim()) errors.name = "Pool name is required.";
  if (!model.trim()) errors.model = "Model is required.";
  if (accountIds.length === 0) errors.members = "Select at least one member account.";
  return errors;
}

export interface CodexPoolMemberUsageLimit {
  kind: CodexUsageWindowKind;
  label: string;
  remainingPercent: number;
}

export interface CodexPoolMemberUsageRow {
  accountId: string;
  identity: string;
  tier: string;
  state: "loading" | "error" | "ready" | "unavailable";
  limits: CodexPoolMemberUsageLimit[];
}

const POOL_USAGE_LABELS: Partial<Record<CodexUsageWindowKind, string>> = {
  "5h": "5HR",
  daily: "DAY",
  weekly: "WK",
  monthly: "MO",
  annual: "YR",
};

function poolUsageLabel(window: CodexUsageWindow): string {
  return POOL_USAGE_LABELS[window.kind] ?? window.label.replace(/\s+limit$/i, "").toUpperCase();
}

function windowsForTier(tier: string, windows: CodexUsageWindow[]): CodexUsageWindow[] {
  if (tier === "FREE") return windows.filter((window) => window.kind === "monthly");
  if (tier === "PLUS") {
    return windows.filter((window) => window.kind === "5h" || window.kind === "weekly");
  }
  return windows;
}

export function buildCodexPoolMemberUsageRows(
  pool: CodexAccountPool,
  accounts: CodexAccount[],
  usageCache: Record<string, any>,
): CodexPoolMemberUsageRow[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  return pool.accountIds.flatMap((accountId) => {
    const account = accountsById.get(accountId);
    if (!account) return [];

    const cache = usageCache[accountId];
    const tier = classifyCodexTier(
      cache?.planName ?? account.lastPlan,
      isCodexAccountOAuth(account, cache),
    );
    const limits: CodexPoolMemberUsageLimit[] = [];

    if (cache?.rate_limit && isCodexAccountOAuth(account, cache)) {
      const windows = windowsForTier(tier, normalizeCodexUsageWindows(cache.rate_limit));
      for (const window of windows) {
        limits.push({
          kind: window.kind,
          label: poolUsageLabel(window),
          remainingPercent: Math.round(Math.max(0, 100 - window.usedPercent)),
        });
      }
    }

    const state = cache?.loading
      ? "loading"
      : cache?.error
        ? "error"
        : limits.length > 0
          ? "ready"
          : "unavailable";

    return [
      {
        accountId,
        identity: account.email?.trim() || account.label,
        tier,
        state,
        limits,
      },
    ];
  });
}
