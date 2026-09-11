export interface SearchableAccount {
  label?: string | null;
  email?: string | null;
}

export function matchesAccountQuery(
  account: SearchableAccount,
  query?: string | null,
): boolean {
  const normalized = (query || "").trim().toLowerCase();
  if (!normalized) return true;
  const nameMatch = account.label ? account.label.toLowerCase().includes(normalized) : false;
  const emailMatch = account.email ? account.email.toLowerCase().includes(normalized) : false;
  return nameMatch || emailMatch;
}

export function filterAccountsByQuery<T extends SearchableAccount>(
  accounts: T[],
  query?: string | null,
): T[] {
  const normalized = (query || "").trim().toLowerCase();
  if (!normalized) return accounts;
  return accounts.filter((acc) => matchesAccountQuery(acc, normalized));
}
