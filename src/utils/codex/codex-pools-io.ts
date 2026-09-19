import type { CodexAccount, CodexAccountPool } from "../common/types.js";
import { normalizeCodexPools, reconcileCodexPools } from "./codex-pools.js";

export interface PoolExportPayload {
  version: 1;
  type: "quotashift_pools";
  exportedAt: string;
  pools: CodexAccountPool[];
}

export interface PoolImportResult {
  pools: CodexAccountPool[];
  importedCount: number;
  updatedCount: number;
  error?: string;
}

export function exportPoolsToJson(pools: CodexAccountPool[]): string {
  const payload: PoolExportPayload = {
    version: 1,
    type: "quotashift_pools",
    exportedAt: new Date().toISOString(),
    pools,
  };
  return JSON.stringify(payload, null, 2);
}

export function importPoolsFromJson(
  jsonContent: string,
  currentPools: CodexAccountPool[],
  accounts: CodexAccount[],
): PoolImportResult {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (err: any) {
    return {
      pools: currentPools,
      importedCount: 0,
      updatedCount: 0,
      error: `Invalid JSON format: ${err?.message || err}`,
    };
  }

  let poolCandidates: any[] = [];
  if (Array.isArray(parsed)) {
    poolCandidates = parsed;
  } else if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.pools)) {
      poolCandidates = parsed.pools;
    } else if (parsed.codex && Array.isArray(parsed.codex.pools)) {
      poolCandidates = parsed.codex.pools;
    }
  }

  const normalized = normalizeCodexPools(poolCandidates);
  if (normalized.length === 0) {
    return {
      pools: currentPools,
      importedCount: 0,
      updatedCount: 0,
      error: "No valid model pools found in the imported data",
    };
  }

  // Build account lookup maps to remap or preserve IDs
  const accountIds = new Set(accounts.map((a) => a.id));
  const emailToId = new Map<string, string>();
  for (const acc of accounts) {
    if (acc.email) emailToId.set(acc.email.trim().toLowerCase(), acc.id);
  }

  const poolsMap = new Map<string, CodexAccountPool>();
  for (const p of currentPools) {
    poolsMap.set(p.id, p);
  }

  let importedCount = 0;
  let updatedCount = 0;

  for (const incoming of normalized) {
    const remappedAccountIds = incoming.accountIds.map((id) => {
      if (accountIds.has(id)) return id;
      const lower = id.toLowerCase();
      if (emailToId.has(lower)) return emailToId.get(lower)!;
      return id;
    });

    const poolToStore: CodexAccountPool = {
      ...incoming,
      accountIds: remappedAccountIds,
    };

    if (poolsMap.has(incoming.id)) {
      poolsMap.set(incoming.id, poolToStore);
      updatedCount++;
    } else {
      poolsMap.set(incoming.id, poolToStore);
      importedCount++;
    }
  }

  const reconciled = reconcileCodexPools([...poolsMap.values()], accounts);

  return {
    pools: reconciled,
    importedCount,
    updatedCount,
  };
}
