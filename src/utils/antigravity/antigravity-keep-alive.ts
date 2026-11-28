import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { deobfuscate, obfuscate } from "../auth/auth.js";
import { loadKeepAlivePreference } from "../common/backup/app-constants.js";
import { resumeAccountPolling } from "../account/capture/account-poll-suspension.js";

const ANTIGRAVITY_ACCOUNTS_KEY = "antigravity-accounts-list";
const DEFAULT_KEEP_ALIVE_INTERVAL_MINS = 240;
const TOKEN_UPDATE_EVENT = "antigravity-keep-alive-tokens";
export const ANTIGRAVITY_KEEP_ALIVE_UPDATED_EVENT = "quotashift:antigravity-keep-alive-updated";

interface StoredAntigravityAccount {
  id: string;
  token: string;
  refreshToken?: string;
  authMethod?: string;
  email?: string;
  [key: string]: unknown;
}

interface AntigravityKeepAliveAccount {
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  authMethod?: string;
  email?: string;
}

interface AntigravityKeepAliveTokenUpdate {
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  authMethod?: string;
}

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "getItem" | "setItem">;

let initialized = false;
let syncQueued = false;
let isPersistingRefreshedTokens = false;

function loadAccounts(storage: StorageReader = localStorage): StoredAntigravityAccount[] {
  try {
    const raw = storage.getItem(ANTIGRAVITY_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to read Antigravity accounts for keep-alive", error);
    return [];
  }
}

export function buildKeepAliveAccounts(
  storage: StorageReader = localStorage,
): AntigravityKeepAliveAccount[] {
  return loadAccounts(storage).flatMap((account) => {
    if (!account?.id) return [];
    try {
      const accessToken = account.token ? deobfuscate(account.token) : "";
      const refreshToken = account.refreshToken ? deobfuscate(account.refreshToken) : undefined;
      if (!accessToken && !refreshToken) return [];
      const email =
        typeof account.email === "string" && account.email.trim()
          ? account.email.trim()
          : undefined;
      return [
        {
          accountId: account.id,
          accessToken,
          refreshToken,
          authMethod: account.authMethod,
          email,
        },
      ];
    } catch (error) {
      console.warn(`Skipping Antigravity keep-alive account ${account.id}`, error);
      return [];
    }
  });
}

export async function syncAntigravityKeepAliveAccounts(): Promise<void> {
  await invoke("sync_antigravity_keep_alive_accounts", {
    accounts: buildKeepAliveAccounts(),
  });
}

export function persistRefreshedTokens(
  update: AntigravityKeepAliveTokenUpdate,
  storage: StorageWriter = localStorage,
): void {
  if (!update.accountId || !update.accessToken) return;
  const accounts = loadAccounts(storage);
  let changed = false;
  const updated = accounts.map((account) => {
    if (account.id !== update.accountId) return account;
    changed = true;
    return {
      ...account,
      token: obfuscate(update.accessToken),
      refreshToken: update.refreshToken ? obfuscate(update.refreshToken) : account.refreshToken,
      tokenRefreshedAt: Date.now(),
      authMethod: update.authMethod || account.authMethod,
    };
  });

  if (changed) {
    try {
      isPersistingRefreshedTokens = true;
      storage.setItem(ANTIGRAVITY_ACCOUNTS_KEY, JSON.stringify(updated));
    } finally {
      isPersistingRefreshedTokens = false;
    }
    resumeAccountPolling("antigravity", update.accountId);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(
        new CustomEvent(ANTIGRAVITY_KEEP_ALIVE_UPDATED_EVENT, {
          detail: { accountId: update.accountId },
        }),
      );
    }
  }
}

export function notifyAntigravityKeepAliveStorageChange(key: string): void {
  if (isPersistingRefreshedTokens || key !== ANTIGRAVITY_ACCOUNTS_KEY || syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    syncAntigravityKeepAliveAccounts().catch((error) => {
      console.warn("Failed to synchronize Antigravity keep-alive accounts", error);
    });
  });
}

export async function initializeAntigravityKeepAliveBridge(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await listen<AntigravityKeepAliveTokenUpdate>(TOKEN_UPDATE_EVENT, (event) => {
    try {
      persistRefreshedTokens(event.payload);
    } catch (error) {
      console.warn("Failed to persist refreshed Antigravity keep-alive credentials", error);
    }
  });

  await syncAntigravityKeepAliveAccounts();

  const enabled = loadKeepAlivePreference();
  if (enabled) {
    await invoke("start_keep_alive", { intervalMins: DEFAULT_KEEP_ALIVE_INTERVAL_MINS });
  } else {
    await invoke("stop_keep_alive");
  }
}
