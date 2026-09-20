import test from "node:test";
import assert from "node:assert/strict";
import {
  SecureStorageAdapter,
  installSecureStorageFacade,
  flushSecureStorage,
} from "../.test-build/auth/secure-storage.js";

const ACCOUNT_KEY = "antigravity-accounts-list";

function nativeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
    key(index) { return [...values.keys()][index] ?? null; },
    get length() { return values.size; },
  };
}

function legacyStore(events = []) {
  const values = new Map();
  return {
    values,
    async keys() { return [...values.keys()]; },
    async get(key) { return values.get(key); },
    async set(key, value) { events.push("store:set:" + key); values.set(key, value); },
    async delete(key) { events.push("store:delete:" + key); values.delete(key); },
    async save() { events.push("store:save"); },
  };
}

function backend(initial = {}, events = []) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async load() { return Object.fromEntries(values); },
    async set(key, value) { events.push("backend:set:" + key); values.set(key, value); },
    async delete(key) { events.push("backend:delete:" + key); values.delete(key); },
  };
}

test("secure storage covers non-sensitive mirrored storage, clear, enumeration, and double hydration", async () => {
  const events = [];
  const native = nativeStorage({ plain: "one" });
  const store = legacyStore(events);
  const secure = backend({ [ACCOUNT_KEY]: "secret" }, events);
  const mutations = [];
  const adapter = new SecureStorageAdapter({
    nativeStorage: native,
    store,
    backend: secure,
    onMutation: (key) => mutations.push(key),
  });

  await adapter.hydrate();
  await adapter.hydrate();
  assert.equal(adapter.isHydrated, true);
  assert.equal(adapter.getItem("plain"), "one");
  assert.equal(adapter.getItem(ACCOUNT_KEY), "secret");
  assert.equal(adapter.key(-1), null);
  assert.equal(adapter.key(1.5), null);

  adapter.setItem("antigravity-theme", "light");
  adapter.removeItem("antigravity-theme");
  adapter.setItem(ACCOUNT_KEY, "next");
  await adapter.flush();
  assert.deepEqual(mutations, [ACCOUNT_KEY]);
  assert.ok(events.includes("store:set:antigravity-theme"));
  assert.ok(events.includes("store:delete:antigravity-theme"));
  assert.ok(events.includes("backend:set:" + ACCOUNT_KEY));

  adapter.clear();
  await adapter.flush();
  assert.equal(adapter.getItem(ACCOUNT_KEY), null);
  assert.equal(native.length, 0);
  assert.ok(events.includes("backend:delete:" + ACCOUNT_KEY));
});

test("secure storage surfaces non-sensitive store failure and install facade delegates flush", async () => {
  const errors = [];
  const native = nativeStorage();
  const store = legacyStore();
  store.set = async () => { throw new Error("store write failed"); };
  const adapter = new SecureStorageAdapter({
    nativeStorage: native,
    store,
    backend: backend(),
    onError: (error) => errors.push(error.message),
  });
  await adapter.hydrate();
  adapter.setItem("antigravity-theme", "dark");
  await assert.rejects(() => adapter.flush(), /store write failed/);
  assert.deepEqual(errors, ["store write failed"]);

  const target = { localStorage: nativeStorage() };
  const facade = installSecureStorageFacade(adapter, target);
  assert.equal(target.localStorage, facade);
  facade.setItem("plain", "value");
  assert.equal(facade.getItem("plain"), "value");
  await flushSecureStorage();
});
