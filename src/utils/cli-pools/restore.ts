import { normalizeCliRotationPools } from "./normalize.js";
import type { CliRotationPoolV1 } from "./types.js";

interface RestoredAccounts {
  agy: readonly { id: string }[];
  codex: readonly { id: string }[];
  agyIdMap: ReadonlyMap<string, string>;
  codexIdMap: ReadonlyMap<string, string>;
}

/** Merge imported definitions; unrelated local pools survive older or partial backups. */
export function mergeRestoredCliPools(
  imported: unknown,
  current: CliRotationPoolV1[],
  accounts: RestoredAccounts,
): { pools: CliRotationPoolV1[]; importedCount: number } {
  const poolsById = new Map(current.map((pool) => [pool.id, pool]));
  const importedPools = normalizeCliRotationPools(imported);
  const knownIds = {
    agy: new Set(accounts.agy.map((account) => account.id)),
    codex: new Set(accounts.codex.map((account) => account.id)),
  };
  for (const pool of importedPools) {
    const idMap = pool.provider === "agy" ? accounts.agyIdMap : accounts.codexIdMap;
    const accountIds = [...new Set(pool.accountIds.map((id) => idMap.get(id) ?? id))];
    poolsById.set(pool.id, {
      ...pool,
      accountIds,
      autoSwitch: false,
      enabled: pool.enabled && accountIds.every((id) => knownIds[pool.provider].has(id)),
    });
  }
  return { pools: [...poolsById.values()], importedCount: importedPools.length };
}
