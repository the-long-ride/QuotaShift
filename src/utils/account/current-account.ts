import { deobfuscate, parseOpenAiAuthClaims } from "../auth/auth.js";
import {
  normalizeDistinctCodexAccountId,
  SHARED_LOCAL_CODEX_ACCOUNT_ID,
} from "../codex/current-local-session.js";
import type { AntigravityAccount, CodexAccount } from "../common/types";

export function normalizeAccountIdentity(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function credentialValue(value: string | null | undefined): string {
  return value ? deobfuscate(value) : "";
}

function isDistinctCodexAccountId(accountId: string): boolean {
  return normalizeDistinctCodexAccountId(accountId) !== null;
}

function codexAccountId(account: Pick<CodexAccount, "apiKey">): string {
  try {
    const parsed = JSON.parse(credentialValue(account.apiKey));
    const explicit = typeof parsed?.accountId === "string" ? parsed.accountId.trim() : "";
    if (normalizeDistinctCodexAccountId(explicit)) return explicit;
    const claimId =
      parseOpenAiAuthClaims(parsed?.idToken)?.chatgptAccountId ??
      parseOpenAiAuthClaims(parsed?.accessToken)?.chatgptAccountId ??
      "";
    return claimId || explicit;
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
    const emailMatch = accounts.find(
      (account) => normalizeAccountIdentity(account.email) === email,
    );
    if (emailMatch) return emailMatch;
  }

  const refreshToken = credentialValue(candidate.refreshToken);
  if (refreshToken) {
    const refreshMatch = accounts.find(
      (account) => credentialValue(account.refreshToken) === refreshToken,
    );
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
  if (isDistinctCodexAccountId(candidateAccountId)) {
    const accountIdMatch = accounts.find(
      (account) => codexAccountId(account) === candidateAccountId,
    );
    if (accountIdMatch) return accountIdMatch;
  }

  const email = normalizeAccountIdentity(candidate.email);
  if (email) {
    const emailMatch = accounts.find((account) => {
      if (normalizeAccountIdentity(account.email) !== email) return false;
      const existingAccountId = codexAccountId(account);
      if (isDistinctCodexAccountId(candidateAccountId)) {
        return existingAccountId === SHARED_LOCAL_CODEX_ACCOUNT_ID;
      }
      if (candidateAccountId === SHARED_LOCAL_CODEX_ACCOUNT_ID) {
        return existingAccountId === SHARED_LOCAL_CODEX_ACCOUNT_ID;
      }
      return !existingAccountId;
    });
    if (emailMatch) return emailMatch;
  }

  const credential = credentialValue(candidate.apiKey);
  return credential
    ? accounts.find((account) => credentialValue(account.apiKey) === credential)
    : undefined;
}

export function upsertAccountById<T extends { id: string }>(accounts: T[], account: T): T[] {
  const index = accounts.findIndex((existing) => existing.id === account.id);
  if (index < 0) return [...accounts, account];
  return accounts.map((existing, currentIndex) => (currentIndex === index ? account : existing));
}
