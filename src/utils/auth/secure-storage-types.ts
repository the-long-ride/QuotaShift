import { invoke } from "@tauri-apps/api/core";

export const SENSITIVE_STORAGE_KEYS = new Set([
  "antigravity-accounts-list",
  "antigravity-codex-accounts",
  "quotashift_local_antigravity_session_v1",
]);

export function isSensitiveStorageKey(key: string): boolean {
  return (
    SENSITIVE_STORAGE_KEYS.has(key) || (key.startsWith("antigravity-") && key.endsWith("-accounts"))
  );
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface LegacyStoreLike {
  keys(): Promise<string[]>;
  get<T>(key: string): Promise<T | null | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean | void>;
  save(): Promise<void>;
}

export interface SecureStorageBackend {
  load(): Promise<Record<string, string>>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SecureStorageAdapterOptions {
  nativeStorage: StorageLike;
  store: LegacyStoreLike;
  backend: SecureStorageBackend;
  onError?: (error: Error) => void;
  onMutation?: (key: string) => void;
  isStoreBackedKey?: (key: string) => boolean;
}

export interface SecureStorageFacade extends StorageLike {}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function createTauriSecureStorageBackend(): SecureStorageBackend {
  return {
    load: () => invoke<Record<string, string>>("secure_storage_load"),
    set: (key, value) => invoke("secure_storage_set", { key, value }),
    delete: (key) => invoke("secure_storage_delete", { key }),
  };
}
