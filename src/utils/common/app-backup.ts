import { encrypt, decrypt, EncryptedBundle } from "../auth/crypto.js";
import { AntigravityAccount, CodexAccount, CodexAccountPool } from "./types.js";
import { loadCodexPools, saveAntigravityAccounts, saveCodexAccounts, saveCodexPools } from "./app-storage.js";
import { saveAccountOrder } from "../account/account-order.js";
import { normalizeCodexPools, reconcileCodexPools } from "../codex/codex-pools.js";
import { ANTIGRAVITY_ORDER_KEY, CODEX_ORDER_KEY } from "./app-constants.js";

export const buildBackupData = (
  antigravityAccounts: AntigravityAccount[],
  codexAccounts: CodexAccount[],
  theme: string,
) => {
  return {
    version: 2,
    createdAt: new Date().toISOString(),
    theme,
    antigravity: {
      accounts: antigravityAccounts,
    },
    codex: {
      accounts: codexAccounts,
      pools: loadCodexPools(),
    },
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
  importedCodexCount: number;
  updatedCodexCount: number;
  importedPoolsCount: number;
  accounts: {
    antigravity: AntigravityAccount[];
    codex: CodexAccount[];
    pools: CodexAccountPool[];
  };
}

export const extractBackupPayload = (data: any) => {
  if (!data || typeof data !== "object") return { agAccounts: [], cxAccounts: [], pools: [] };
  let agAccounts: any[] = [];
  let cxAccounts: any[] = [];
  let pools: any[] = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === "object") {
        if (item.token) agAccounts.push(item);
        else if (item.apiKey) cxAccounts.push(item);
      }
    }
  } else {
    if (data.antigravity && Array.isArray(data.antigravity.accounts)) {
      agAccounts = [...data.antigravity.accounts];
    } else if (Array.isArray(data.antigravityAccounts)) {
      agAccounts = [...data.antigravityAccounts];
    }

    if (data.codex) {
      const pData = data.codex;
      if (Array.isArray(pData.accounts)) cxAccounts = [...pData.accounts];
      if (Array.isArray(pData.pools)) pools = [...pData.pools];
    } else if (Array.isArray(data.codexAccounts)) {
      cxAccounts = [...data.codexAccounts];
    }

    if (data.platforms && typeof data.platforms === "object") {
      if (data.platforms.antigravity && Array.isArray(data.platforms.antigravity.accounts)) {
        agAccounts = [...agAccounts, ...data.platforms.antigravity.accounts];
      }
      if (data.platforms.codex) {
        if (Array.isArray(data.platforms.codex.accounts)) {
          cxAccounts = [...cxAccounts, ...data.platforms.codex.accounts];
        }
        if (Array.isArray(data.platforms.codex.pools)) {
          pools = [...pools, ...data.platforms.codex.pools];
        }
      }
    }

    if (Array.isArray(data.pools)) {
      pools = [...pools, ...data.pools];
    }
  }

  return { agAccounts, cxAccounts, pools };
};

export const restoreBackupData = (
  rawBackup: any,
  currentAgAccounts: AntigravityAccount[],
  currentCxAccounts: CodexAccount[],
  currentPools: CodexAccountPool[] = [],
): RestoreBackupResult => {
  const { agAccounts, cxAccounts, pools } = extractBackupPayload(rawBackup);

  let importedAg = 0;
  let updatedAg = 0;
  const nextAg = [...currentAgAccounts];

  for (const imp of agAccounts) {
    if (!imp || typeof imp !== "object") continue;
    const existingIdx = nextAg.findIndex(
      (a) =>
        (imp.id && a.id === imp.id) ||
        (imp.email && a.email && a.email.toLowerCase() === imp.email.toLowerCase()),
    );
    if (existingIdx !== -1) {
      nextAg[existingIdx] = { ...nextAg[existingIdx], ...imp, id: nextAg[existingIdx].id };
      updatedAg++;
    } else {
      const id = imp.id || `ag-acct-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      nextAg.push({ ...imp, id });
      importedAg++;
    }
  }

  let importedCx = 0;
  let updatedCx = 0;
  const nextCx = [...currentCxAccounts];
  const importedIdMap = new Map<string, string>();

  for (const imp of cxAccounts) {
    if (!imp || typeof imp !== "object") continue;
    const existingIdx = nextCx.findIndex(
      (a) =>
        (imp.id && a.id === imp.id) ||
        (imp.email && a.email && a.email.toLowerCase() === imp.email.toLowerCase()),
    );
    if (existingIdx !== -1) {
      const savedId = nextCx[existingIdx].id;
      nextCx[existingIdx] = { ...nextCx[existingIdx], ...imp, id: savedId };
      if (imp.id) importedIdMap.set(imp.id, savedId);
      updatedCx++;
    } else {
      const id = imp.id || `acct-oauth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      nextCx.push({ ...imp, id });
      if (imp.id) importedIdMap.set(imp.id, id);
      importedCx++;
    }
  }

  const remappedPools = normalizeCodexPools(pools).map((pool) => ({
    ...pool,
    accountIds: pool.accountIds.map((id) => importedIdMap.get(id) || id),
  }));
  const poolsById = new Map<string, CodexAccountPool>();
  currentPools.forEach((p) => poolsById.set(p.id, p));
  remappedPools.forEach((p) => poolsById.set(p.id, p));
  const reconciled = reconcileCodexPools([...poolsById.values()], nextCx);

  saveAntigravityAccounts(nextAg);
  saveAccountOrder(ANTIGRAVITY_ORDER_KEY, nextAg.map((a) => a.id));
  saveCodexAccounts(nextCx);
  saveAccountOrder(CODEX_ORDER_KEY, nextCx.map((a) => a.id));
  saveCodexPools(reconciled);

  return {
    importedAntigravityCount: importedAg,
    updatedAntigravityCount: updatedAg,
    importedCodexCount: importedCx,
    updatedCodexCount: updatedCx,
    importedPoolsCount: remappedPools.length,
    accounts: {
      antigravity: nextAg,
      codex: nextCx,
      pools: reconciled,
    },
  };
};
