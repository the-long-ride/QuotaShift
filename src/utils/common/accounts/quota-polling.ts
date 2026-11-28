import { loadTrackedList, readPrimaryEntry, type TrackedProvider } from "./tracked-accounts.js";

export const QUOTA_POLLING_DISABLED_KEY = "quotashift_quota_polling_disabled_v1";
export const QUOTA_POLLING_CHANGED_EVENT = "quotashift:quota-polling-changed";
type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;
const storage = (): Storage | null => (typeof localStorage === "undefined" ? null : localStorage);

export function loadDisabledQuotaPollingIds(
  provider: TrackedProvider,
  reader: Reader | null = storage(),
): string[] {
  try {
    const saved = reader?.getItem(QUOTA_POLLING_DISABLED_KEY);
    const parsed: unknown = saved ? JSON.parse(saved) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const values = (parsed as Record<string, unknown>)[provider];
    return Array.isArray(values)
      ? [...new Set(values.filter((id): id is string => typeof id === "string" && !!id))]
      : [];
  } catch {
    return [];
  }
}

export function isQuotaPollingEnabled(
  provider: TrackedProvider,
  id: string,
  reader: Reader | null = storage(),
): boolean {
  if (loadTrackedList(reader).some((entry) => entry.provider === provider && entry.id === id))
    return true;
  const primary = readPrimaryEntry(reader);
  if (primary?.provider === provider && primary.id === id) return true;
  return !loadDisabledQuotaPollingIds(provider, reader).includes(id);
}

function writeDisabledIds(
  provider: TrackedProvider,
  ids: readonly string[],
  store: Reader & Writer,
): void {
  try {
    const raw = store.getItem(QUOTA_POLLING_DISABLED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const record: Record<string, unknown> =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    store.setItem(QUOTA_POLLING_DISABLED_KEY, JSON.stringify({ ...record, [provider]: ids }));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(QUOTA_POLLING_CHANGED_EVENT));
  } catch {
    // Storage permissions should not prevent quota cards from rendering.
  }
}

export function setQuotaPollingEnabled(
  provider: TrackedProvider,
  id: string,
  enabled: boolean,
  store: (Reader & Writer) | null = storage(),
): void {
  if (!store) return;
  const ids = new Set(loadDisabledQuotaPollingIds(provider, store));
  if (enabled) ids.delete(id);
  else ids.add(id);
  writeDisabledIds(provider, [...ids], store);
}

export function enableAllQuotaPolling(
  provider: TrackedProvider,
  accountIds: readonly string[],
): void {
  const store = storage();
  if (!store || !accountIds.length) return;
  const disabled = loadDisabledQuotaPollingIds(provider, store);
  const enabling = new Set(accountIds);
  const next = disabled.filter((id) => !enabling.has(id));
  if (next.length !== disabled.length) writeDisabledIds(provider, next, store);
}

export function scheduledQuotaAccounts<T extends { id: string }>(
  provider: TrackedProvider,
  accounts: readonly T[],
): T[] {
  return accounts.filter((account) => isQuotaPollingEnabled(provider, account.id));
}

/** Resolve the actual fallback account before consulting its quota-polling preference. */
export function eligibleFallbackQuotaAccountId(
  provider: "antigravity" | "codex",
  selectedId: string | null,
  accounts: readonly { id: string }[],
  reader: Reader | null = storage(),
): string | null {
  const target = accounts.find((account) => account.id === selectedId) ?? accounts[0];
  return target && isQuotaPollingEnabled(provider, target.id, reader) ? target.id : null;
}
