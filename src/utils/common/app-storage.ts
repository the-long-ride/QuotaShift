import {
  AntigravityAccount,
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
} from "./types";
import { loadAccountOrder, sortByOrder } from "../account/account-order.js";
import { normalizeCodexPools } from "../codex/codex-pools.js";
import {
  ANTIGRAVITY_ACCOUNTS_KEY,
  ANTIGRAVITY_ORDER_KEY,
  CODEX_ACCOUNTS_KEY,
  CODEX_ORDER_KEY,
  CODEX_POOLS_KEY,
  CODEX_MODEL_CATALOG_STORAGE_KEY,
  CODEX_USAGE_CACHE_STORAGE_KEY,
} from "./app-constants.js";

export const loadAntigravityAccounts = (): AntigravityAccount[] => {
  try {
    const raw = localStorage.getItem(ANTIGRAVITY_ACCOUNTS_KEY);
    const list = raw ? (JSON.parse(raw) as AntigravityAccount[]) : [];
    return sortByOrder(list, loadAccountOrder(ANTIGRAVITY_ORDER_KEY));
  } catch {
    return [];
  }
};

export const saveAntigravityAccounts = (accounts: AntigravityAccount[]): void => {
  localStorage.setItem(ANTIGRAVITY_ACCOUNTS_KEY, JSON.stringify(accounts));
};

export const loadCodexAccounts = (): CodexAccount[] => {
  try {
    const raw = localStorage.getItem(CODEX_ACCOUNTS_KEY);
    const list = raw ? (JSON.parse(raw) as CodexAccount[]) : [];
    return sortByOrder(list, loadAccountOrder(CODEX_ORDER_KEY));
  } catch {
    return [];
  }
};

export const saveCodexAccounts = (accounts: CodexAccount[]): void => {
  localStorage.setItem(CODEX_ACCOUNTS_KEY, JSON.stringify(accounts));
};

export const loadCodexPools = (): CodexAccountPool[] => {
  try {
    const raw = localStorage.getItem(CODEX_POOLS_KEY);
    return raw ? normalizeCodexPools(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
};

export const saveCodexPools = (pools: CodexAccountPool[]): void => {
  localStorage.setItem(CODEX_POOLS_KEY, JSON.stringify(pools));
};

export const loadCodexModelCache = (): Record<string, CodexModelCatalogCacheEntry> => {
  try {
    const raw = localStorage.getItem(CODEX_MODEL_CATALOG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const saveCodexModelCache = (cache: Record<string, CodexModelCatalogCacheEntry>): void => {
  localStorage.setItem(CODEX_MODEL_CATALOG_STORAGE_KEY, JSON.stringify(cache));
};

type UsageCacheStorage = Pick<Storage, "getItem" | "setItem">;

export const loadCodexUsageCache = (
  storage: UsageCacheStorage = localStorage,
): Record<string, any> => {
  try {
    const raw = storage.getItem(CODEX_USAGE_CACHE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([accountId, value]) => {
        if (!value || typeof value !== "object") return [];
        const entry = value as Record<string, any>;
        if (typeof entry.fetchedAt !== "number" || !Number.isFinite(entry.fetchedAt)) return [];
        return [[accountId, { ...entry, loading: false, error: undefined }]];
      }),
    );
  } catch {
    return {};
  }
};

export const saveCodexUsageEntry = (
  accountId: string,
  entry: Record<string, any>,
  storage: UsageCacheStorage = localStorage,
): void => {
  if (typeof entry.fetchedAt !== "number" || !Number.isFinite(entry.fetchedAt)) return;
  const cache = loadCodexUsageCache(storage);
  const { loading: _loading, error: _error, ...persistentEntry } = entry;
  storage.setItem(
    CODEX_USAGE_CACHE_STORAGE_KEY,
    JSON.stringify({ ...cache, [accountId]: { ...persistentEntry, loading: false } }),
  );
};
