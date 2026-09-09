import test from "node:test";
import assert from "node:assert/strict";
import { SENSITIVE_STORAGE_KEYS, SecureStorageAdapter, isSensitiveStorageKey } from "../.test-build/secure-storage.js";

const ACCOUNT_KEY = "antigravity-accounts-list";

function fakeNative(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
    key(index) { return [...values.keys()][index] ?? null; },
    get length() { return values.size; },
    has(key) { return values.has(key); },
  };
}

function fakeStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async keys() { return [...values.keys()]; },
    async get(key) { return values.has(key) ? values.get(key) : null; },
    async set(key, value) { values.set(key, value); },
    async delete(key) { values.delete(key); },
    async save() {},
  };
}

function fakeBackend(initial = {}, events = []) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async load() { events.push("load"); return Object.fromEntries(values); },
    async set(key, value) { events.push(`set:${key}`); values.set(key, value); },
    async delete(key) { events.push(`delete:${key}`); values.delete(key); },
  };
}

test("legacy account data is persisted securely before every plaintext copy is removed", async () => {
  const native = fakeNative({ [ACCOUNT_KEY]: '{"token":"legacy-token"}' });
  const store = fakeStore({ [ACCOUNT_KEY]: '{"token":"legacy-token"}' });
  const events = [];
  const backend = fakeBackend({}, events);
  const adapter = new SecureStorageAdapter({ nativeStorage: native, store, backend });

  await adapter.hydrate();

  assert.deepEqual(events, ["load", `set:${ACCOUNT_KEY}`]);
  assert.equal(native.getItem(ACCOUNT_KEY), null);
  assert.equal(store.values.has(ACCOUNT_KEY), false);
  assert.equal(adapter.getItem(ACCOUNT_KEY), '{"token":"legacy-token"}');
  assert.ok(SENSITIVE_STORAGE_KEYS.has(ACCOUNT_KEY));
});

test("failed secure migration retains recoverable legacy data and does not install a facade", async () => {
  const native = fakeNative({ [ACCOUNT_KEY]: '{"token":"recoverable"}' });
  const store = fakeStore({ [ACCOUNT_KEY]: '{"token":"recoverable"}' });
  const backend = fakeBackend();
  backend.set = async () => { throw new Error("vault unavailable"); };
  const adapter = new SecureStorageAdapter({ nativeStorage: native, store, backend });

  await assert.rejects(() => adapter.hydrate(), /vault unavailable/);
  assert.equal(native.getItem(ACCOUNT_KEY), '{"token":"recoverable"}');
  assert.equal(store.values.get(ACCOUNT_KEY), '{"token":"recoverable"}');
  assert.equal(adapter.isHydrated, false);
});

test("sensitive writes and deletes are serialized while synchronous reads use memory", async () => {
  const native = fakeNative();
  const store = fakeStore();
  const events = [];
  const backend = fakeBackend({}, events);
  const adapter = new SecureStorageAdapter({ nativeStorage: native, store, backend });
  await adapter.hydrate();

  const facade = adapter.createStorageFacade();
  facade.setItem(ACCOUNT_KEY, "first");
  facade.setItem(ACCOUNT_KEY, "second");
  facade.removeItem(ACCOUNT_KEY);
  assert.equal(facade.getItem(ACCOUNT_KEY), null);
  await adapter.flush();

  assert.deepEqual(events, ["load", `set:${ACCOUNT_KEY}`, `set:${ACCOUNT_KEY}`, `delete:${ACCOUNT_KEY}`]);
  assert.equal(backend.values.has(ACCOUNT_KEY), false);
  assert.equal(native.has(ACCOUNT_KEY), false);
});

test("facade enumerates secure account data without writing it to native localStorage", async () => {
  const native = fakeNative({ "antigravity-theme": "dark" });
  const backend = fakeBackend({ [ACCOUNT_KEY]: "secure-value" });
  const adapter = new SecureStorageAdapter({ nativeStorage: native, store: fakeStore(), backend });
  await adapter.hydrate();
  const facade = adapter.createStorageFacade();

  assert.equal(facade.getItem(ACCOUNT_KEY), "secure-value");
  assert.equal(native.getItem(ACCOUNT_KEY), null);
  assert.equal(facade.length, 2);
  assert.deepEqual(new Set([facade.key(0), facade.key(1)]), new Set([ACCOUNT_KEY, "antigravity-theme"]));
});

test("imported platform account keys migrate through the secure backend", async () => {
  const importedKey = "antigravity-custom-platform-accounts";
  const native = fakeNative({ [importedKey]: '[{"token":"imported"}]' });
  const backend = fakeBackend();
  const adapter = new SecureStorageAdapter({ nativeStorage: native, store: fakeStore(), backend });

  await adapter.hydrate();

  assert.equal(isSensitiveStorageKey(importedKey), true);
  assert.equal(adapter.getItem(importedKey), '[{"token":"imported"}]');
  assert.equal(native.getItem(importedKey), null);
  assert.equal(backend.values.get(importedKey), '[{"token":"imported"}]');
});

test("queued backend failures are visible through flush and roll back the memory value", async () => {
  const native = fakeNative();
  const backend = fakeBackend();
  backend.set = async () => { throw new Error("write failed"); };
  const adapter = new SecureStorageAdapter({ nativeStorage: native, store: fakeStore(), backend });
  await adapter.hydrate();
  const facade = adapter.createStorageFacade();

  facade.setItem(ACCOUNT_KEY, "unpersisted");
  await assert.rejects(() => adapter.flush(), /write failed/);
  assert.equal(facade.getItem(ACCOUNT_KEY), null);
});

test("an older failed write cannot roll back a newer successful write", async () => {
  const native = fakeNative();
  const backend = fakeBackend();
  backend.set = async (key, value) => {
    if (value === "first") throw new Error("first write failed");
    backend.values.set(key, value);
  };
  const adapter = new SecureStorageAdapter({ nativeStorage: native, store: fakeStore(), backend });
  await adapter.hydrate();
  const facade = adapter.createStorageFacade();
  facade.setItem(ACCOUNT_KEY, "first");
  facade.setItem(ACCOUNT_KEY, "second");

  await assert.rejects(() => adapter.flush(), /first write failed/);
  assert.equal(facade.getItem(ACCOUNT_KEY), "second");
  assert.equal(backend.values.get(ACCOUNT_KEY), "second");
  await adapter.flush();
});

test("a failed delete restores the last value that was actually persisted", async () => {
  const native = fakeNative();
  const backend = fakeBackend({ [ACCOUNT_KEY]: "persisted" });
  backend.delete = async () => { throw new Error("delete failed"); };
  const adapter = new SecureStorageAdapter({ nativeStorage: native, store: fakeStore(), backend });
  await adapter.hydrate();
  const facade = adapter.createStorageFacade();
  facade.setItem(ACCOUNT_KEY, "new-value");
  facade.removeItem(ACCOUNT_KEY);

  await assert.rejects(() => adapter.flush(), /delete failed/);
  assert.equal(facade.getItem(ACCOUNT_KEY), "new-value");
});
