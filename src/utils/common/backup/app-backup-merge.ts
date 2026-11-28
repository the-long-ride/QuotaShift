import type { AntigravityAccount, CodexAccount } from "../types.js";
import {
  extractAntigravityCredentialRefreshTimeMs,
  extractCodexCredentialRefreshTimeMs,
  extractCodexOAuthAccountId,
  isImportedCredentialOlder,
  parseCredentialTimestampMs,
} from "./credential-freshness.js";

export const normId = (val?: string | null): string =>
  typeof val === "string" ? val.trim().toLowerCase() : "";

export interface MergeRestoredAccountsOptions {
  backupCreatedAt?: unknown;
}

export interface MergedAntigravityResult {
  nextAg: AntigravityAccount[];
  importedAg: number;
  updatedAg: number;
  skippedOlderAg: number;
  importedIdMap: Map<string, string>;
}

export const mergeRestoredAntigravityAccounts = (
  agAccounts: any[],
  currentAgAccounts: AntigravityAccount[],
  options?: MergeRestoredAccountsOptions,
): MergedAntigravityResult => {
  let importedAg = 0;
  let updatedAg = 0;
  let skippedOlderAg = 0;
  const nextAg = [...currentAgAccounts];
  const importedIdMap = new Map<string, string>();
  const backupCreatedMs = parseCredentialTimestampMs(options?.backupCreatedAt);

  for (const imp of agAccounts) {
    if (!imp || typeof imp !== "object") continue;
    const impEmail = normId(imp.email);
    const impRefreshToken = imp.refreshToken || imp.refresh_token;
    const existingIdx = nextAg.findIndex(
      (a) =>
        Boolean(imp.id && a.id === imp.id) ||
        Boolean(impEmail && normId(a.email) === impEmail) ||
        Boolean(
          !impEmail &&
          !normId(a.email) &&
          impRefreshToken &&
          a.refreshToken &&
          impRefreshToken === a.refreshToken,
        ) ||
        Boolean(!impEmail && !normId(a.email) && imp.token && a.token && imp.token === a.token),
    );
    if (existingIdx !== -1) {
      const existing = nextAg[existingIdx];
      const importedMs = extractAntigravityCredentialRefreshTimeMs(imp, backupCreatedMs);
      const existingMs = extractAntigravityCredentialRefreshTimeMs(existing);
      if (isImportedCredentialOlder(importedMs, existingMs)) {
        if (imp.id) importedIdMap.set(imp.id, existing.id);
        skippedOlderAg++;
        continue;
      }
      const merged: AntigravityAccount = {
        ...existing,
        ...imp,
        id: existing.id,
        refreshToken: impRefreshToken || existing.refreshToken,
      };
      if (!merged.refreshToken) delete merged.refreshToken;
      delete (merged as any).refresh_token;
      nextAg[existingIdx] = merged;
      if (imp.id) importedIdMap.set(imp.id, existing.id);
      updatedAg++;
    } else {
      const id = imp.id || `ag-acct-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newAccount: AntigravityAccount = {
        ...imp,
        id,
        ...(impRefreshToken ? { refreshToken: impRefreshToken } : {}),
      };
      delete (newAccount as any).refresh_token;
      nextAg.push(newAccount);
      if (imp.id) importedIdMap.set(imp.id, id);
      importedAg++;
    }
  }

  return { nextAg, importedAg, updatedAg, skippedOlderAg, importedIdMap };
};

export interface MergedCodexResult {
  nextCx: CodexAccount[];
  importedCx: number;
  updatedCx: number;
  skippedOlderCx: number;
  importedIdMap: Map<string, string>;
}

export const mergeRestoredCodexAccounts = (
  cxAccounts: any[],
  currentCxAccounts: CodexAccount[],
  options?: MergeRestoredAccountsOptions,
): MergedCodexResult => {
  let importedCx = 0;
  let updatedCx = 0;
  let skippedOlderCx = 0;
  const nextCx = [...currentCxAccounts];
  const importedIdMap = new Map<string, string>();
  const backupCreatedMs = parseCredentialTimestampMs(options?.backupCreatedAt);

  for (const imp of cxAccounts) {
    if (!imp || typeof imp !== "object") continue;
    const impEmail = normId(imp.email);
    const impAccountId = extractCodexOAuthAccountId(imp);
    const existingIdx = nextCx.findIndex((a) => {
      if (imp.id && a.id === imp.id) return true;
      const aAccountId = extractCodexOAuthAccountId(a);
      if (impAccountId && aAccountId && impAccountId !== aAccountId) {
        return false;
      }
      if (impEmail && normId(a.email) === impEmail) return true;
      return Boolean(
        !impEmail && !normId(a.email) && imp.apiKey && a.apiKey && imp.apiKey === a.apiKey,
      );
    });
    if (existingIdx !== -1) {
      const existing = nextCx[existingIdx];
      const importedMs = extractCodexCredentialRefreshTimeMs(imp, backupCreatedMs);
      const existingMs = extractCodexCredentialRefreshTimeMs(existing);
      if (isImportedCredentialOlder(importedMs, existingMs)) {
        if (imp.id) importedIdMap.set(imp.id, existing.id);
        skippedOlderCx++;
        continue;
      }
      const savedId = existing.id;
      nextCx[existingIdx] = { ...existing, ...imp, id: savedId };
      if (imp.id) importedIdMap.set(imp.id, savedId);
      updatedCx++;
    } else {
      const id = imp.id || `acct-oauth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      nextCx.push({ ...imp, id });
      if (imp.id) importedIdMap.set(imp.id, id);
      importedCx++;
    }
  }

  return { nextCx, importedCx, updatedCx, skippedOlderCx, importedIdMap };
};
