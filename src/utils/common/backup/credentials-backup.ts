import type { AntigravityAccount, CodexAccount } from "../types.js";
import { saveAntigravityAccounts, saveCodexAccounts } from "./app-storage.js";
import { loadAccountOrder, saveAccountOrder, sortByOrder } from "../../account/account-order.js";
import { ANTIGRAVITY_ORDER_KEY, CODEX_ORDER_KEY } from "./app-constants.js";
import {
  mergeRestoredAntigravityAccounts,
  mergeRestoredCodexAccounts,
} from "./app-backup-merge.js";
import { extractBackupPayload } from "./app-backup.js";

export interface RestoreCredentialsResult {
  importedAntigravityCount: number;
  updatedAntigravityCount: number;
  importedCodexCount: number;
  updatedCodexCount: number;
  accounts: {
    antigravity: AntigravityAccount[];
    codex: CodexAccount[];
  };
}

export const buildCredentialsBackupData = (
  antigravityAccounts: AntigravityAccount[],
  codexAccounts: CodexAccount[],
) => ({
  version: 1,
  type: "quotashift_credentials_backup",
  createdAt: new Date().toISOString(),
  antigravity: {
    accounts: antigravityAccounts.map((account) => {
      const refreshToken = account.refreshToken || (account as any).refresh_token;
      return {
        ...account,
        ...(refreshToken ? { refreshToken } : {}),
      };
    }),
  },
  codex: {
    accounts: codexAccounts,
  },
});

export const restoreCredentialsData = (
  rawBackup: any,
  currentAgAccounts: AntigravityAccount[],
  currentCxAccounts: CodexAccount[],
): RestoreCredentialsResult => {
  const { agAccounts, cxAccounts } = extractBackupPayload(rawBackup);

  const { nextAg, importedAg, updatedAg } = mergeRestoredAntigravityAccounts(
    agAccounts,
    currentAgAccounts,
  );

  const { nextCx, importedCx, updatedCx } = mergeRestoredCodexAccounts(
    cxAccounts,
    currentCxAccounts,
  );

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

  saveAntigravityAccounts(sortedAg);
  saveAccountOrder(ANTIGRAVITY_ORDER_KEY, nextAgOrder);
  saveCodexAccounts(sortedCx);
  saveAccountOrder(CODEX_ORDER_KEY, nextCxOrder);

  return {
    importedAntigravityCount: importedAg,
    updatedAntigravityCount: updatedAg,
    importedCodexCount: importedCx,
    updatedCodexCount: updatedCx,
    accounts: {
      antigravity: sortedAg,
      codex: sortedCx,
    },
  };
};
