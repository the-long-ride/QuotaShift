import { deobfuscate } from "../auth/auth.js";
import type { AntigravityAccount, CodexAccount } from "../common/types";

export function normalizeAccountIdentity(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function credentialValue(value: string | null | undefined): string {
  return value ? deobfuscate(value) : "";
}

function codexAccountId(account: Pick<CodexAccount, "apiKey">): string {
  try {
    const parsed = JSON.parse(credentialValue(account.apiKey));
    return typeof parsed?.accountId === "string" ? parsed.accountId : "";
  } catch {
    return "";
  }
}

export function findAntigravityAccountMatch(
  accounts: AntigravityAccount[],
  candidate: AntigravityAccount,
): AntigravityAccount | undefined {
  const email = normalizeAccountIdentity(candidate.email);
  if (email) {
    const emailMatch = accounts.find((account) => normalizeAccountIdentity(account.email) === email);
    if (emailMatch) return emailMatch;
  }

  const refreshToken = credentialValue(candidate.refreshToken);
  if (refreshToken) {
    const refreshMatch = accounts.find((account) => credentialValue(account.refreshToken) === refreshToken);
    if (refreshMatch) return refreshMatch;
  }

  const token = credentialValue(candidate.token);
  return token ? accounts.find((account) => credentialValue(account.token) === token) : undefined;
}

export function findCodexAccountMatch(
  accounts: CodexAccount[],
  candidate: CodexAccount,
): CodexAccount | undefined {
  const candidateAccountId = codexAccountId(candidate);
  if (candidateAccountId) {
    const accountIdMatch = accounts.find((account) => codexAccountId(account) === candidateAccountId);
    if (accountIdMatch) return accountIdMatch;
  }

  const email = normalizeAccountIdentity(candidate.email);
  if (email) {
    const emailMatch = accounts.find((account) => normalizeAccountIdentity(account.email) === email);
    if (emailMatch) return emailMatch;
  }

  const credential = credentialValue(candidate.apiKey);
  return credential ? accounts.find((account) => credentialValue(account.apiKey) === credential) : undefined;
}

export function upsertAccountById<T extends { id: string }>(accounts: T[], account: T): T[] {
  const index = accounts.findIndex((existing) => existing.id === account.id);
  if (index < 0) return [...accounts, account];
  return accounts.map((existing, currentIndex) => (currentIndex === index ? account : existing));
}
