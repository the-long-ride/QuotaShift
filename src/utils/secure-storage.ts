import { invoke } from "@tauri-apps/api/core";

export const SENSITIVE_STORAGE_KEYS = new Set([
  "antigravity-accounts-list",
  "antigravity-codex-accounts",
  "quotashift_local_antigravity_session_v1",
]);

export function isSensitiveStorageKey(key: string): boolean {
  return SENSITIVE_STORAGE_KEYS.has(key)
    || (key.startsWith("antigravity-") && key.endsWith("-accounts"));
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

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Keeps account credentials in a synchronous renderer map while every
 * mutation is serialized to the asynchronous OS-backed backend.
 */
export class SecureStorageAdapter {
  private readonly nativeStorage: StorageLike;
  private readonly store: LegacyStoreLike;
  private readonly backend: SecureStorageBackend;
  private readonly onError?: (error: Error) => void;
  private readonly onMutation?: (key: string) => void;
  private readonly isStoreBackedKey: (key: string) => boolean;
  private readonly secureValues = new Map<string, string>();
  private readonly persistedValues = new Map<string, string>();
  private readonly mutationRevisions = new Map<string, number>();
  private writeChain: Promise<void> = Promise.resolve();
  private queuedFailure: Error | null = null;
  private hydrated = false;

  public constructor(options: SecureStorageAdapterOptions) {
    this.nativeStorage = options.nativeStorage;
    this.store = options.store;
    this.backend = options.backend;
    this.onError = options.onError;
    this.onMutation = options.onMutation;
    this.isStoreBackedKey = options.isStoreBackedKey ?? ((key) => key.startsWith("antigravity-"));
  }

  public get isHydrated(): boolean {
    return this.hydrated;
  }

  /**
   * Loads secure values and migrates legacy native/store copies. Secure writes
   * complete before any plaintext copy is deleted, so a failed migration keeps
   * the legacy copy recoverable and leaves the adapter unusable.
   */
  public async hydrate(decryptedLegacyValues: Record<string, string> = {}): Promise<void> {
    if (this.hydrated) return;

    const secureValues = await this.backend.load();
    if (!secureValues || typeof secureValues !== "object" || Array.isArray(secureValues)) {
      throw new Error("Secure storage returned an invalid value map");
    }

    const storeKeys = await this.store.keys();
    const nativeKeys: string[] = [];
    for (let index = 0; index < this.nativeStorage.length; index += 1) {
      const key = this.nativeStorage.key(index);
      if (key !== null) nativeKeys.push(key);
    }
    const sensitiveKeys = new Set<string>([
      ...SENSITIVE_STORAGE_KEYS,
      ...Object.keys(secureValues).filter(isSensitiveStorageKey),
      ...storeKeys.filter(isSensitiveStorageKey),
      ...nativeKeys.filter(isSensitiveStorageKey),
      ...Object.keys(decryptedLegacyValues).filter(isSensitiveStorageKey),
    ]);
    const legacyStoreValues = new Map<string, string>();
    const legacyNativeValues = new Map<string, string>();
    for (const key of sensitiveKeys) {
      const storeValue = readString(await this.store.get<unknown>(key));
      if (storeKeys.includes(key) && storeValue !== undefined) {
        legacyStoreValues.set(key, storeValue);
      }

      const nativeValue = this.nativeStorage.getItem(key);
      if (nativeValue !== null) legacyNativeValues.set(key, nativeValue);
    }

    const migratedValues = new Map<string, string>();
    for (const key of sensitiveKeys) {
      const secureValue = readString(secureValues[key]);
      if (secureValue !== undefined) {
        migratedValues.set(key, secureValue);
        continue;
      }

      const legacyValue = decryptedLegacyValues[key]
        ?? legacyStoreValues.get(key)
        ?? legacyNativeValues.get(key);
      if (legacyValue === undefined) continue;

      // Do not delete either legacy copy until every secure write succeeds.
      await this.backend.set(key, legacyValue);
      migratedValues.set(key, legacyValue);
    }

    let changedStore = false;
    for (const key of sensitiveKeys) {
      if (!migratedValues.has(key)) continue;
      if (legacyStoreValues.has(key)) {
        await this.store.delete(key);
        changedStore = true;
      }
    }
    if (changedStore) await this.store.save();

    for (const key of sensitiveKeys) {
      if (migratedValues.has(key) && legacyNativeValues.has(key)) {
        this.nativeStorage.removeItem(key);
      }
    }

    this.secureValues.clear();
    this.persistedValues.clear();
    this.mutationRevisions.clear();
    for (const [key, value] of migratedValues) {
      this.secureValues.set(key, value);
      this.persistedValues.set(key, value);
    }
    this.hydrated = true;
  }

  public getItem(key: string): string | null {
    if (isSensitiveStorageKey(key)) return this.secureValues.get(key) ?? null;
    return this.nativeStorage.getItem(key);
  }

  public setItem(key: string, value: string): void {
    const normalizedKey = String(key);
    const normalizedValue = String(value);
    if (!isSensitiveStorageKey(normalizedKey)) {
      this.nativeStorage.setItem(normalizedKey, normalizedValue);
      if (this.isStoreBackedKey(normalizedKey)) {
        this.enqueue(async () => {
          await this.store.set(normalizedKey, normalizedValue);
          await this.store.save();
        });
      }
      return;
    }

    const revision = this.nextRevision(normalizedKey);
    this.secureValues.set(normalizedKey, normalizedValue);
    this.onMutation?.(normalizedKey);
    this.enqueue(
      async () => {
        await this.backend.set(normalizedKey, normalizedValue);
        this.persistedValues.set(normalizedKey, normalizedValue);
      },
      () => this.restoreToPersistedValue(normalizedKey, revision),
    );
  }

  public removeItem(key: string): void {
    const normalizedKey = String(key);
    if (!isSensitiveStorageKey(normalizedKey)) {
      this.nativeStorage.removeItem(normalizedKey);
      if (this.isStoreBackedKey(normalizedKey)) {
        this.enqueue(async () => {
          await this.store.delete(normalizedKey);
          await this.store.save();
        });
      }
      return;
    }

    const revision = this.nextRevision(normalizedKey);
    this.secureValues.delete(normalizedKey);
    this.onMutation?.(normalizedKey);
    this.enqueue(
      async () => {
        await this.backend.delete(normalizedKey);
        this.persistedValues.delete(normalizedKey);
      },
      () => this.restoreToPersistedValue(normalizedKey, revision),
    );
  }

  public clear(): void {
    const previousValues = new Map(this.secureValues);
    this.secureValues.clear();
    this.nativeStorage.clear();
    for (const key of previousValues.keys()) {
      const revision = this.nextRevision(key);
      this.enqueue(
        async () => {
          await this.backend.delete(key);
          this.persistedValues.delete(key);
        },
        () => this.restoreToPersistedValue(key, revision),
      );
    }
  }

  public key(index: number): string | null {
    if (!Number.isInteger(index) || index < 0) return null;
    const keys: string[] = [];
    for (let i = 0; i < this.nativeStorage.length; i += 1) {
      const key = this.nativeStorage.key(i);
      if (key !== null && !isSensitiveStorageKey(key)) keys.push(key);
    }
    for (const key of this.secureValues.keys()) {
      if (!keys.includes(key)) keys.push(key);
    }
    return keys[index] ?? null;
  }

  public get length(): number {
    let count = 0;
    for (let i = 0; i < this.nativeStorage.length; i += 1) {
      const key = this.nativeStorage.key(i);
      if (key !== null && !isSensitiveStorageKey(key)) count += 1;
    }
    for (const key of this.secureValues.keys()) {
      if (this.nativeStorage.getItem(key) === null) count += 1;
    }
    return count;
  }

  public createStorageFacade(): SecureStorageFacade {
    const facade = {
      getItem: (key) => this.getItem(String(key)),
      setItem: (key, value) => this.setItem(String(key), String(value)),
      removeItem: (key) => this.removeItem(String(key)),
      clear: () => this.clear(),
      key: (index) => this.key(index),
    } as SecureStorageFacade;
    Object.defineProperty(facade, "length", { enumerable: true, get: () => this.length });
    return facade;
  }

  public async flush(): Promise<void> {
    await this.writeChain;
    if (this.queuedFailure) {
      const error = this.queuedFailure;
      this.queuedFailure = null;
      throw error;
    }
  }

  private nextRevision(key: string): number {
    const revision = (this.mutationRevisions.get(key) ?? 0) + 1;
    this.mutationRevisions.set(key, revision);
    return revision;
  }

  private restoreToPersistedValue(key: string, revision: number): void {
    if (this.mutationRevisions.get(key) !== revision) return;
    const persisted = this.persistedValues.get(key);
    if (persisted === undefined) this.secureValues.delete(key);
    else this.secureValues.set(key, persisted);
  }

  private enqueue(task: () => Promise<void>, rollback?: () => void): void {
    this.writeChain = this.writeChain.then(task).catch((error: unknown) => {
      rollback?.();
      const normalized = toError(error);
      this.queuedFailure ??= normalized;
      this.onError?.(normalized);
    });
  }
}

export function installSecureStorageFacade(
  adapter: SecureStorageAdapter,
  target: { localStorage: StorageLike },
): SecureStorageFacade {
  const facade = adapter.createStorageFacade();
  installedAdapter = adapter;
  Object.defineProperty(target, "localStorage", {
    configurable: true,
    enumerable: true,
    value: facade,
    writable: false,
  });
  return facade;
}

let installedAdapter: SecureStorageAdapter | null = null;

export async function flushSecureStorage(): Promise<void> {
  await installedAdapter?.flush();
}

export function createTauriSecureStorageBackend(): SecureStorageBackend {
  return {
    load: () => invoke<Record<string, string>>("secure_storage_load"),
    set: (key, value) => invoke("secure_storage_set", { key, value }),
    delete: (key) => invoke("secure_storage_delete", { key }),
  };
}
