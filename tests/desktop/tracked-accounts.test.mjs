import test from "node:test";
import assert from "node:assert/strict";

const m = await import("../../.test-build/common/tracked-accounts.js");

const PROVIDER_KEY = "quotashift_overlay_tracked_provider";
const ACCOUNT_KEY = "quotashift_overlay_tracked_account_id";

const store = (seed = {}) => {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};
const blocked = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};
const e = (provider, id) => ({ provider, id });

test("legacy single tracked account migrates into the list", () => {
  const s = store({ [PROVIDER_KEY]: "codex", [ACCOUNT_KEY]: "work" });
  assert.deepEqual(m.loadTrackedList(s), [e("codex", "work")]);
  assert.deepEqual(m.loadTrackedIds(s), { antigravity: [], codex: ["work"], claude: [] });
});

test("legacy per-provider ids migrate for the shown provider only", () => {
  const s = store({
    [PROVIDER_KEY]: "claude",
    [ACCOUNT_KEY]: "x",
    [m.LEGACY_TRACKED_IDS_KEY]: JSON.stringify({ claude: ["x", "y"], codex: ["c"] }),
  });
  assert.deepEqual(m.loadTrackedList(s), [e("claude", "x"), e("claude", "y")]);
  const empty = store({
    [PROVIDER_KEY]: "codex",
    [ACCOUNT_KEY]: "solo",
    [m.LEGACY_TRACKED_IDS_KEY]: JSON.stringify({ codex: [] }),
  });
  assert.deepEqual(m.loadTrackedList(empty), [e("codex", "solo")]);
});

test("missing, corrupt or blocked storage yields an empty list", () => {
  assert.deepEqual(m.loadTrackedList(store()), []);
  assert.deepEqual(m.loadTrackedList(null), []);
  assert.deepEqual(m.loadTrackedList(blocked), []);
  assert.deepEqual(m.loadTrackedList(store({ [m.TRACKED_LIST_KEY]: "{not json" })), []);
  assert.deepEqual(m.loadTrackedList(store({ [PROVIDER_KEY]: "other" })), []);
  assert.deepEqual(m.loadTrackedList(store({ [PROVIDER_KEY]: "codex" })), []);
});

test("saved list is cleaned, deduplicated and mixed without limit", () => {
  const s = store();
  m.saveTrackedList(
    [e("codex", "a"), e("codex", "a"), null, e("nope", "b"), e("claude", ""), e("claude", "z")],
    s,
  );
  assert.deepEqual(m.loadTrackedList(s), [e("codex", "a"), e("claude", "z")]);
  m.saveTrackedList([e("codex", "1"), e("claude", "2"), e("antigravity", "3"), e("codex", "4")], s);
  assert.equal(m.loadTrackedList(s).length, 4);
  assert.deepEqual(m.loadTrackedIds(s), { antigravity: ["3"], codex: ["1", "4"], claude: ["2"] });
  assert.doesNotThrow(() => m.saveTrackedList([], blocked));
});

test("multi-track switch defaults off, migrates v1 and round-trips", () => {
  assert.equal(m.loadMultiTrackEnabled(store()), false);
  assert.equal(m.loadMultiTrackEnabled(blocked), false);
  const legacy = store({
    [m.LEGACY_MULTI_TRACK_KEY]: JSON.stringify({ antigravity: false, codex: true }),
  });
  assert.equal(m.loadMultiTrackEnabled(legacy), true);
  m.saveMultiTrackEnabled(false, legacy);
  assert.equal(m.loadMultiTrackEnabled(legacy), false);
  m.saveMultiTrackEnabled(true, legacy);
  assert.equal(m.loadMultiTrackEnabled(legacy), true);
  assert.doesNotThrow(() => m.saveMultiTrackEnabled(true, blocked));
});

test("single mode replaces or removes the tracked account across providers", () => {
  const r = m.toggleTrackedEntry([e("codex", "a"), e("claude", "b")], e("claude", "x"), false);
  assert.equal(r.result, "replaced");
  assert.deepEqual(r.list, [e("claude", "x")]);
  const untrack = m.toggleTrackedEntry([e("claude", "x")], e("claude", "x"), false);
  assert.equal(untrack.result, "removed");
  assert.deepEqual(untrack.list, []);
});

test("multi mode mixes providers, adds without limit, and removes down to zero", () => {
  let r = m.toggleTrackedEntry([e("codex", "a")], e("claude", "b"), true);
  assert.equal(r.result, "added");
  r = m.toggleTrackedEntry(r.list, e("antigravity", "c"), true);
  assert.deepEqual(r.list, [e("codex", "a"), e("claude", "b"), e("antigravity", "c")]);
  const fourth = m.toggleTrackedEntry(r.list, e("codex", "d"), true);
  assert.equal(fourth.result, "added");
  assert.deepEqual(fourth.list, [
    e("codex", "a"),
    e("claude", "b"),
    e("antigravity", "c"),
    e("codex", "d"),
  ]);
  r = m.toggleTrackedEntry(r.list, e("claude", "b"), true);
  assert.equal(r.result, "removed");
  assert.deepEqual(r.list, [e("codex", "a"), e("antigravity", "c")]);
  const only = [e("codex", "a")];
  const removeLast = m.toggleTrackedEntry(only, e("codex", "a"), true);
  assert.equal(removeLast.result, "removed");
  assert.deepEqual(removeLast.list, []);
  assert.deepEqual(m.toggleTrackedEntry([], e("codex", "a"), true).list, [e("codex", "a")]);
});

test("primary sync, trim and primary lookup", () => {
  const list = [e("codex", "a"), e("claude", "b")];
  assert.equal(m.ensurePrimaryEntry(list, e("claude", "b"), true), list);
  assert.deepEqual(m.ensurePrimaryEntry(list, e("codex", "n"), true), [
    e("codex", "n"),
    e("claude", "b"),
  ]);
  assert.deepEqual(m.ensurePrimaryEntry(list, e("codex", "n"), false), [e("codex", "n")]);
  assert.deepEqual(m.ensurePrimaryEntry([], e("codex", "n"), true), [e("codex", "n")]);
  assert.deepEqual(m.trimTrackedList(list, e("claude", "b")), [e("claude", "b")]);
  assert.deepEqual(m.trimTrackedList(list, e("claude", "gone")), [e("codex", "a")]);
  assert.deepEqual(m.trimTrackedList(list, null), [e("codex", "a")]);
  const single = [e("codex", "a")];
  assert.equal(m.trimTrackedList(single, null), single);
  assert.deepEqual(
    m.readPrimaryEntry(store({ [PROVIDER_KEY]: "claude", [ACCOUNT_KEY]: "b" })),
    e("claude", "b"),
  );
  assert.equal(m.readPrimaryEntry(store({ [PROVIDER_KEY]: "claude" })), null);
  assert.equal(m.isTrackedProvider("claude"), true);
  assert.equal(m.isTrackedProvider(7), false);
});

test("clearTrackedAccounts empties tracked list and removes legacy keys", () => {
  const s = store({
    [m.TRACKED_LIST_KEY]: JSON.stringify([e("codex", "a"), e("claude", "b")]),
    [PROVIDER_KEY]: "codex",
    [ACCOUNT_KEY]: "a",
  });
  assert.equal(m.loadTrackedList(s).length, 2);
  m.clearTrackedAccounts(s);
  assert.deepEqual(m.loadTrackedList(s), []);
  assert.equal(s.getItem(ACCOUNT_KEY), null);
  assert.equal(s.getItem(PROVIDER_KEY), null);
});

test("untrackAccount removes target account and reassigns primary if needed", () => {
  const s = store({
    [m.TRACKED_LIST_KEY]: JSON.stringify([
      e("codex", "a"),
      e("claude", "b"),
      e("antigravity", "c"),
    ]),
    [PROVIDER_KEY]: "codex",
    [ACCOUNT_KEY]: "a",
  });
  const remaining = m.untrackAccount(e("codex", "a"), s);
  assert.deepEqual(remaining, [e("claude", "b"), e("antigravity", "c")]);
  assert.equal(s.getItem(PROVIDER_KEY), "claude");
  assert.equal(s.getItem(ACCOUNT_KEY), "b");

  const remaining2 = m.untrackAccount(e("antigravity", "c"), s);
  assert.deepEqual(remaining2, [e("claude", "b")]);
  assert.equal(s.getItem(PROVIDER_KEY), "claude");
  assert.equal(s.getItem(ACCOUNT_KEY), "b");

  const remaining3 = m.untrackAccount(e("claude", "b"), s);
  assert.deepEqual(remaining3, []);
  assert.equal(s.getItem(ACCOUNT_KEY), null);
  assert.equal(s.getItem(PROVIDER_KEY), null);
});
