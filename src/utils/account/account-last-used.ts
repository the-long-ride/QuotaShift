export interface AccountLastUsedRecord {
  id: string;
  email?: string;
  lastUsedAt?: number;
}

export function normalizeAccountEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

export function markAccountLastUsed<T extends AccountLastUsedRecord>(
  accounts: T[],
  accountId: string,
  usedAt = Date.now(),
): T[] {
  if (!accountId || !Number.isFinite(usedAt) || usedAt <= 0) return accounts;
  let changed = false;
  const next = accounts.map((account) => {
    if (account.id !== accountId) return account;
    const previous =
      typeof account.lastUsedAt === "number" && Number.isFinite(account.lastUsedAt)
        ? account.lastUsedAt
        : 0;
    if (previous >= usedAt) return account;
    changed = true;
    return { ...account, lastUsedAt: usedAt };
  });
  return changed ? next : accounts;
}

export function markAccountLastUsedByEmail<T extends AccountLastUsedRecord>(
  accounts: T[],
  email: string | null | undefined,
  usedAt = Date.now(),
): T[] {
  const normalized = normalizeAccountEmail(email);
  if (!normalized) return accounts;
  const match = accounts.find((account) => normalizeAccountEmail(account.email) === normalized);
  return match ? markAccountLastUsed(accounts, match.id, usedAt) : accounts;
}

export function formatLastUsed(lastUsedAt: number | null | undefined): string {
  if (typeof lastUsedAt !== "number" || !Number.isFinite(lastUsedAt) || lastUsedAt <= 0) {
    return "";
  }
  const date = new Date(lastUsedAt);
  if (Number.isNaN(date.getTime())) return "";
  return `Last used: ${date.toLocaleString()}`;
}
