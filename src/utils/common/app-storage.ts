import {
  AntigravityAccount,
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
} from "./types";
import { loadAccountOrder, sortByOrder } from "../account/account-order";
import { normalizeCodexPools } from "../codex/codex-pools";
import {
  ANTIGRAVITY_ACCOUNTS_KEY,
  ANTIGRAVITY_ORDER_KEY,
  CODEX_ACCOUNTS_KEY,
  CODEX_ORDER_KEY,
  CODEX_POOLS_KEY,
  CODEX_MODEL_CATALOG_STORAGE_KEY,
} from "./app-constants";

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
