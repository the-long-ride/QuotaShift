import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { deobfuscate, obfuscate } from "./auth";

const ANTIGRAVITY_ACCOUNTS_KEY = "antigravity-accounts-list";
const KEEP_ALIVE_KEY = "keepAliveActive";
const DEFAULT_KEEP_ALIVE_INTERVAL_MINS = 240;
const TOKEN_UPDATE_EVENT = "antigravity-keep-alive-tokens";

interface StoredAntigravityAccount {
  id: string;
  token: string;
  refreshToken?: string;
  authMethod?: string;
  [key: string]: unknown;
}

interface AntigravityKeepAliveAccount {
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  authMethod?: string;
}

interface AntigravityKeepAliveTokenUpdate {
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  authMethod?: string;
}

let initialized = false;
let syncQueued = false;

function loadAccounts(): StoredAntigravityAccount[] {
  try {
    const raw = localStorage.getItem(ANTIGRAVITY_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to read Antigravity accounts for keep-alive", error);
    return [];
  }
}

function buildKeepAliveAccounts(): AntigravityKeepAliveAccount[] {
  return loadAccounts().flatMap((account) => {
    if (!account?.id) return [];
    try {
      const accessToken = account.token ? deobfuscate(account.token) : "";
      const refreshToken = account.refreshToken ? deobfuscate(account.refreshToken) : undefined;
      if (!accessToken && !refreshToken) return [];
      return [
        {
          accountId: account.id,
          accessToken,
          refreshToken,
          authMethod: account.authMethod,
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

function persistRefreshedTokens(update: AntigravityKeepAliveTokenUpdate): void {
  if (!update.accountId || !update.accessToken) return;
  const accounts = loadAccounts();
  let changed = false;
  const updated = accounts.map((account) => {
    if (account.id !== update.accountId) return account;
    changed = true;
    return {
      ...account,
      token: obfuscate(update.accessToken),
      refreshToken: update.refreshToken
        ? obfuscate(update.refreshToken)
        : account.refreshToken,
      authMethod: update.authMethod || account.authMethod,
    };
  });

  if (changed) {
    localStorage.setItem(ANTIGRAVITY_ACCOUNTS_KEY, JSON.stringify(updated));
  }
}

export function notifyAntigravityKeepAliveStorageChange(key: string): void {
  if (key !== ANTIGRAVITY_ACCOUNTS_KEY || syncQueued) return;
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

  const enabled = localStorage.getItem(KEEP_ALIVE_KEY) !== "false";
  if (enabled) {
    await invoke("start_keep_alive", { intervalMins: DEFAULT_KEEP_ALIVE_INTERVAL_MINS });
  } else {
    await invoke("stop_keep_alive");
  }
}
