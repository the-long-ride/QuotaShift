import type { AntigravityAccount, CodexAccount } from "./types.js";

export const normId = (val?: string | null): string =>
  typeof val === "string" ? val.trim().toLowerCase() : "";

export interface MergedAntigravityResult {
  nextAg: AntigravityAccount[];
  importedAg: number;
  updatedAg: number;
}

export const mergeRestoredAntigravityAccounts = (
  agAccounts: any[],
  currentAgAccounts: AntigravityAccount[],
): MergedAntigravityResult => {
  let importedAg = 0;
  let updatedAg = 0;
  const nextAg = [...currentAgAccounts];

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
      const merged: AntigravityAccount = {
        ...existing,
        ...imp,
        id: existing.id,
        refreshToken: impRefreshToken || existing.refreshToken,
      };
      if (!merged.refreshToken) delete merged.refreshToken;
      delete (merged as any).refresh_token;
      nextAg[existingIdx] = merged;
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
      importedAg++;
    }
  }

  return { nextAg, importedAg, updatedAg };
};

export interface MergedCodexResult {
  nextCx: CodexAccount[];
  importedCx: number;
  updatedCx: number;
  importedIdMap: Map<string, string>;
}

export const mergeRestoredCodexAccounts = (
  cxAccounts: any[],
  currentCxAccounts: CodexAccount[],
): MergedCodexResult => {
  let importedCx = 0;
  let updatedCx = 0;
  const nextCx = [...currentCxAccounts];
  const importedIdMap = new Map<string, string>();

  for (const imp of cxAccounts) {
    if (!imp || typeof imp !== "object") continue;
    const impEmail = normId(imp.email);
    const existingIdx = nextCx.findIndex(
      (a) =>
        Boolean(imp.id && a.id === imp.id) ||
        Boolean(impEmail && normId(a.email) === impEmail) ||
        Boolean(!impEmail && !normId(a.email) && imp.apiKey && a.apiKey && imp.apiKey === a.apiKey),
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

  return { nextCx, importedCx, updatedCx, importedIdMap };
};
