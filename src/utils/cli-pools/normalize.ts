import type {
  CliProvider,
  CliQuotaWindowKind,
  CliRotationBindingsV1,
  CliRotationPoolV1,
} from "./types.js";

const VALID_PROVIDERS: readonly CliProvider[] = ["agy", "codex"];
const VALID_WINDOWS: readonly CliQuotaWindowKind[] = ["5h", "weekly", "monthly"];

interface AccountLike {
  id: string;
  provider?: string;
}

function matchesProvider(accountProvider: string | undefined, poolProvider: CliProvider): boolean {
  if (!accountProvider) return false;
  const norm = accountProvider.toLowerCase();
  if (poolProvider === "agy") {
    return norm === "antigravity" || norm === "agy";
  }
  return norm === "codex";
}

function normalizeTriggerWindows(raw: unknown): CliQuotaWindowKind[] {
  if (!Array.isArray(raw)) return ["5h", "weekly"];
  const filtered = raw.filter(
    (w): w is CliQuotaWindowKind =>
      typeof w === "string" && VALID_WINDOWS.includes(w as CliQuotaWindowKind),
  );
  return filtered.length > 0 ? [...new Set(filtered)] : ["5h", "weekly"];
}

export function normalizeCliRotationPools(
  value: unknown,
  knownAccounts?: AccountLike[],
): CliRotationPoolV1[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const normalized: CliRotationPoolV1[] = [];

  const accountsById = knownAccounts ? new Map(knownAccounts.map((a) => [a.id, a])) : null;

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<CliRotationPoolV1>;

    const id = typeof item.id === "string" ? item.id.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const provider = item.provider as CliProvider;

    if (!id || !name || !VALID_PROVIDERS.includes(provider) || seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);

    const rawAccountIds = Array.isArray(item.accountIds) ? item.accountIds : [];
    const deduplicatedAccountIds: string[] = [];
    const seenAccountIds = new Set<string>();

    for (const rawAccId of rawAccountIds) {
      if (typeof rawAccId !== "string") continue;
      const accId = rawAccId.trim();
      if (!accId || seenAccountIds.has(accId)) continue;

      if (accountsById) {
        const acc = accountsById.get(accId);
        if (!acc || !matchesProvider(acc.provider, provider)) continue;
      }

      seenAccountIds.add(accId);
      deduplicatedAccountIds.push(accId);
    }

    normalized.push({
      id,
      provider,
      name,
      accountIds: deduplicatedAccountIds,
      enabled: Boolean(item.enabled),
      autoSwitch: Boolean(item.autoSwitch),
      triggerWindows: normalizeTriggerWindows(item.triggerWindows),
      fallbackLatestEnabled: Boolean(item.fallbackLatestEnabled),
      switchWhenIdleOnly: item.switchWhenIdleOnly !== false,
    });
  }

  return normalized;
}

export function validateCliPoolBinding(
  bindings: unknown,
  pools: CliRotationPoolV1[],
): CliRotationBindingsV1 {
  const result: CliRotationBindingsV1 = {
    agyActivePoolId: null,
    codexActivePoolId: null,
  };

  if (!bindings || typeof bindings !== "object") return result;
  const b = bindings as Partial<CliRotationBindingsV1>;

  const activePoolMap = new Map(pools.filter((p) => p.enabled).map((p) => [p.id, p]));

  if (typeof b.agyActivePoolId === "string") {
    const pool = activePoolMap.get(b.agyActivePoolId);
    if (pool && pool.provider === "agy") {
      result.agyActivePoolId = pool.id;
    }
  }

  if (typeof b.codexActivePoolId === "string") {
    const pool = activePoolMap.get(b.codexActivePoolId);
    if (pool && pool.provider === "codex") {
      result.codexActivePoolId = pool.id;
    }
  }

  return result;
}

export function reconcileCliRotationPools(
  pools: CliRotationPoolV1[],
  knownAccounts: AccountLike[],
): CliRotationPoolV1[] {
  return normalizeCliRotationPools(pools, knownAccounts);
}
