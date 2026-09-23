import type { AntigravityAccount } from "../common/types";
import { findAntigravityAccountMatch } from "../account/current-account.js";

export interface CapturedAntigravitySource {
  source: string;
  session: unknown;
}

export interface CapturedAntigravityImport {
  accounts: AntigravityAccount[];
  unique: AntigravityAccount[];
  added: AntigravityAccount[];
}

function candidateQuality(account: AntigravityAccount): number {
  return Number(Boolean(account.refreshToken)) * 2 + Number(Boolean(account.email));
}

export function uniqueCapturedAntigravityAccounts(
  candidates: AntigravityAccount[],
): AntigravityAccount[] {
  const unique: AntigravityAccount[] = [];
  for (const candidate of candidates) {
    let preferred = candidate;
    let firstMatch = unique.length;
    let foundAnother = true;
    while (foundAnother) {
      foundAnother = false;
      for (let index = unique.length - 1; index >= 0; index--) {
        const current = unique[index];
        if (!findAntigravityAccountMatch([current], preferred)) continue;
        if (candidateQuality(current) >= candidateQuality(preferred)) preferred = current;
        firstMatch = Math.min(firstMatch, index);
        unique.splice(index, 1);
        foundAnother = true;
      }
    }
    unique.splice(firstMatch, 0, preferred);
  }
  return unique;
}

export function importCapturedAntigravityAccounts(
  existing: AntigravityAccount[],
  candidates: AntigravityAccount[],
  createId: () => string = () => `ag-acct-${crypto.randomUUID()}`,
): CapturedAntigravityImport {
  const unique = uniqueCapturedAntigravityAccounts(candidates);
  const accounts = [...existing];
  const added: AntigravityAccount[] = [];
  for (const candidate of unique) {
    if (findAntigravityAccountMatch(accounts, candidate)) continue;
    const account = { ...candidate, id: createId() };
    accounts.push(account);
    added.push(account);
  }
  return { accounts, unique, added };
}
