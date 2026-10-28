export type AccountPollingProvider = "antigravity" | "codex";

const STORAGE_KEY = "quotashift_auth_poll_suspensions_v1";

type SuspensionState = Partial<Record<AccountPollingProvider, string[]>>;

function getStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readState(): SuspensionState {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as SuspensionState;
  } catch {
    return {};
  }
}

function writeState(state: SuspensionState) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function isAccountPollingSuspended(
  provider: AccountPollingProvider,
  accountId: string,
): boolean {
  if (!accountId) return false;
  return (readState()[provider] || []).includes(accountId);
}

export function suspendAccountPolling(provider: AccountPollingProvider, accountId: string): void {
  if (!accountId) return;
  const state = readState();
  const ids = new Set(state[provider] || []);
  ids.add(accountId);
  writeState({ ...state, [provider]: [...ids] });
}

export function resumeAccountPolling(provider: AccountPollingProvider, accountId: string): void {
  if (!accountId) return;
  const state = readState();
  const current = state[provider] || [];
  if (!current.includes(accountId)) return;
  writeState({ ...state, [provider]: current.filter((id) => id !== accountId) });
}

export const ACCOUNT_POLL_SUSPENDED_ERROR =
  "Re-authentication required. Automatic usage polling is paused for this account.";
