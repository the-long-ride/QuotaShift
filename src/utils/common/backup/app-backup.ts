import { encrypt, decrypt, EncryptedBundle } from "../../auth/crypto.js";
import { AntigravityAccount, CodexAccount, CodexAccountPool } from "../types.js";
import { CliRotationPoolV1 } from "../../cli-pools/types.js";
import { mergeRestoredCliPools } from "../../cli-pools/restore.js";
import {
  loadCliRotationPools,
  loadCodexPools,
  saveAntigravityAccounts,
  saveCliRotationPools,
  saveCodexAccounts,
  saveCodexPools,
} from "./app-storage.js";
import { loadAccountOrder, saveAccountOrder, sortByOrder } from "../../account/account-order.js";
import { normalizeCodexPools, reconcileCodexPools } from "../../codex/pools/codex-pools.js";
import { ANTIGRAVITY_ORDER_KEY, CODEX_ORDER_KEY } from "./app-constants.js";
import {
  mergeRestoredAntigravityAccounts,
  mergeRestoredCodexAccounts,
} from "./app-backup-merge.js";
import { applyBackupSettings, collectSettings, extractBackupSettings } from "./settings-backup.js";
import {
  extractBackupPayload,
  isAntigravityCandidate,
  isCodexCandidate,
} from "./backup-payload-extract.js";

export { extractBackupPayload, isAntigravityCandidate, isCodexCandidate };

export const buildBackupData = (
  antigravityAccounts: AntigravityAccount[],
  codexAccounts: CodexAccount[],
  theme: string,
) => {
  const currentCliPools = loadCliRotationPools();
  return {
    version: 3,
    createdAt: new Date().toISOString(),
    theme,
    settings: collectSettings(),
    antigravity: {
      accounts: antigravityAccounts.map((account) => {
        const refreshToken = account.refreshToken || (account as any).refresh_token;
        return {
          ...account,
          ...(refreshToken ? { refreshToken } : {}),
        };
      }),
      cliPools: currentCliPools.filter((p) => p.provider === "agy"),
    },
    codex: {
      accounts: codexAccounts,
      pools: loadCodexPools(),
      cliPools: currentCliPools.filter((p) => p.provider === "codex"),
    },
    cliPools: currentCliPools,
  };
};

export const encryptBackup = async (data: any, passphrase: string): Promise<string> => {
  const json = JSON.stringify(data);
  const bundle = await encrypt(json, passphrase);
  return JSON.stringify(bundle);
};

export const decryptBackup = async (content: string, passphrase: string): Promise<any> => {
  const bundle: EncryptedBundle = JSON.parse(content);
  const decrypted = await decrypt(bundle, passphrase);
  return JSON.parse(decrypted);
};

export interface RestoreBackupResult {
  importedAntigravityCount: number;
  updatedAntigravityCount: number;
  skippedOlderAntigravityCount: number;
  importedCodexCount: number;
  updatedCodexCount: number;
  skippedOlderCodexCount: number;
  importedPoolsCount: number;
  importedCliPoolsCount?: number;
  importedSettingsCount: number;
  accounts: {
    antigravity: AntigravityAccount[];
    codex: CodexAccount[];
    pools: CodexAccountPool[];
    cliPools?: CliRotationPoolV1[];
  };
}

export const restoreBackupData = (
  rawBackup: any,
  currentAgAccounts: AntigravityAccount[],
  currentCxAccounts: CodexAccount[],
  currentPools: CodexAccountPool[] = [],
): RestoreBackupResult => {
  const { agAccounts, cxAccounts, pools, cliPools } = extractBackupPayload(rawBackup);

  const mergeOptions = { backupCreatedAt: rawBackup?.createdAt };
  const {
    nextAg,
    importedAg,
    updatedAg,
    skippedOlderAg,
    importedIdMap: agyIdMap,
  } = mergeRestoredAntigravityAccounts(agAccounts, currentAgAccounts, mergeOptions);

  const { nextCx, importedCx, updatedCx, skippedOlderCx, importedIdMap } =
    mergeRestoredCodexAccounts(cxAccounts, currentCxAccounts, mergeOptions);

  const remappedPools = normalizeCodexPools(pools).map((pool) => ({
    ...pool,
    accountIds: pool.accountIds.map((id) => importedIdMap.get(id) || id),
  }));
  const poolsById = new Map<string, CodexAccountPool>();
  currentPools.forEach((p) => poolsById.set(p.id, p));
  remappedPools.forEach((p) => poolsById.set(p.id, p));
  const reconciled = reconcileCodexPools([...poolsById.values()], nextCx);

  const agOrder = loadAccountOrder(ANTIGRAVITY_ORDER_KEY);
  const nextAgOrder = [...agOrder.filter((id) => nextAg.some((a) => a.id === id))];
  for (const a of nextAg) {
    if (!nextAgOrder.includes(a.id)) nextAgOrder.push(a.id);
  }
  const sortedAg = sortByOrder(nextAg, nextAgOrder);

  const cxOrder = loadAccountOrder(CODEX_ORDER_KEY);
  const nextCxOrder = [...cxOrder.filter((id) => nextCx.some((a) => a.id === id))];
  for (const a of nextCx) {
    if (!nextCxOrder.includes(a.id)) nextCxOrder.push(a.id);
  }
  const sortedCx = sortByOrder(nextCx, nextCxOrder);

  const restoredCliPools = mergeRestoredCliPools(cliPools, loadCliRotationPools(), {
    agy: nextAg,
    codex: nextCx,
    agyIdMap,
    codexIdMap: importedIdMap,
  });

  saveAntigravityAccounts(sortedAg);
  saveAccountOrder(ANTIGRAVITY_ORDER_KEY, nextAgOrder);
  saveCodexAccounts(sortedCx);
  saveAccountOrder(CODEX_ORDER_KEY, nextCxOrder);
  saveCodexPools(reconciled);
  saveCliRotationPools(restoredCliPools.pools);

  const importedSettingsCount = applyBackupSettings(extractBackupSettings(rawBackup), undefined, {
    knownPoolIds: reconciled.map((pool) => pool.id),
  });

  return {
    importedAntigravityCount: importedAg,
    updatedAntigravityCount: updatedAg,
    skippedOlderAntigravityCount: skippedOlderAg,
    importedCodexCount: importedCx,
    updatedCodexCount: updatedCx,
    skippedOlderCodexCount: skippedOlderCx,
    importedPoolsCount: remappedPools.length,
    importedCliPoolsCount: restoredCliPools.importedCount,
    importedSettingsCount,
    accounts: {
      antigravity: sortedAg,
      codex: sortedCx,
      pools: reconciled,
      cliPools: restoredCliPools.pools,
    },
  };
};
