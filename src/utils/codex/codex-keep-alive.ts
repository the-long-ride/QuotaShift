import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { deobfuscate, obfuscate } from "../auth/auth.js";
import {
  CODEX_ACCOUNTS_KEY,
  CODEX_ACTIVE_ID_KEY,
  loadKeepAlivePreference,
} from "../common/app-constants.js";
import type { CodexAccount } from "../common/types.js";
import { syncActiveCodexAccount } from "./app-codex-ops.js";

export const DEFAULT_CODEX_KEEP_ALIVE_INTERVAL_MINS = 240;
export const CODEX_TOKEN_UPDATE_EVENT = "codex-keep-alive-tokens";

export interface CodexKeepAliveAccount {
  accountId: string;
  apiKey: string;
  email?: string;
}

export interface CodexKeepAliveTokenUpdate {
  accountId: string;
  apiKey: string;
}

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "getItem" | "setItem">;

let initialized = false;
let syncQueued = false;

export function loadCodexAccountsForKeepAlive(
  storage: StorageReader = localStorage,
): CodexAccount[] {
  try {
    const raw = storage.getItem(CODEX_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to read Codex accounts for keep-alive", error);
    return [];
  }
}

export function buildCodexKeepAliveAccounts(
  storage: StorageReader = localStorage,
): CodexKeepAliveAccount[] {
  return loadCodexAccountsForKeepAlive(storage).flatMap((account) => {
    if (!account?.id) return [];
    try {
      const apiKey = account.apiKey ? deobfuscate(account.apiKey) : "";
      if (!apiKey) return [];
      return [
        {
          accountId: account.id,
          apiKey,
          email: account.email,
        },
      ];
    } catch (error) {
      console.warn(`Skipping Codex keep-alive account ${account.id}`, error);
      return [];
    }
  });
}

export async function syncCodexKeepAliveAccounts(
  storage: StorageReader = localStorage,
): Promise<void> {
  await invoke("sync_codex_keep_alive_accounts", {
    accounts: buildCodexKeepAliveAccounts(storage),
  });
}

export function persistRefreshedCodexTokens(
  update: CodexKeepAliveTokenUpdate,
  storage: StorageWriter = localStorage,
): void {
  if (!update.accountId || !update.apiKey) return;
  const accounts = loadCodexAccountsForKeepAlive(storage);
  let changed = false;
  const updated = accounts.map((account) => {
    if (account.id !== update.accountId) return account;
    changed = true;
    let newEmail = account.email;
    try {
      if (update.apiKey.startsWith("{")) {
        const parsed = JSON.parse(update.apiKey);
        if (parsed.email && !newEmail) {
          newEmail = parsed.email;
        }
      }
    } catch {
      // ignore JSON parse error
    }
    return {
      ...account,
      apiKey: obfuscate(update.apiKey),
      email: newEmail,
    };
  });

  if (changed) {
    storage.setItem(CODEX_ACCOUNTS_KEY, JSON.stringify(updated));
    const activeId = storage.getItem(CODEX_ACTIVE_ID_KEY);
    if (activeId === update.accountId || (!activeId && updated[0]?.id === update.accountId)) {
      syncActiveCodexAccount(activeId, updated).catch((error) => {
        console.warn("Failed to sync active Codex account config after refresh", error);
      });
    }
  }
}

export function notifyCodexKeepAliveStorageChange(key: string): void {
  if (key !== CODEX_ACCOUNTS_KEY || syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    syncCodexKeepAliveAccounts().catch((error) => {
      console.warn("Failed to synchronize Codex keep-alive accounts", error);
    });
  });
}

export async function initializeCodexKeepAliveBridge(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await listen<CodexKeepAliveTokenUpdate>(CODEX_TOKEN_UPDATE_EVENT, (event) => {
    try {
      persistRefreshedCodexTokens(event.payload);
    } catch (error) {
      console.warn("Failed to persist refreshed Codex keep-alive credentials", error);
    }
  });

  await syncCodexKeepAliveAccounts();

  const enabled = loadKeepAlivePreference();
  if (enabled) {
    await invoke("start_keep_alive", {
      intervalMins: DEFAULT_CODEX_KEEP_ALIVE_INTERVAL_MINS,
    });
  } else {
    await invoke("stop_keep_alive");
  }
}
