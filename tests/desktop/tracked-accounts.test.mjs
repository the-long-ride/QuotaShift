import test from "node:test";
import assert from "node:assert/strict";

const m = await import("../../.test-build/common/tracked-accounts.js");

const store = (seed = {}) => {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
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
const ids = (antigravity = [], codex = [], claude = []) => ({ antigravity, codex, claude });

test("legacy single tracked account migrates into the provider list", () => {
  const s = store({
    quotashift_overlay_tracked_provider: "codex",
    quotashift_overlay_tracked_account_id: "work",
  });
  assert.deepEqual(m.loadTrackedIds(s), ids([], ["work"], []));
});

test("missing, corrupt or blocked storage yields empty lists", () => {
  assert.deepEqual(m.loadTrackedIds(store()), ids());
  assert.deepEqual(m.loadTrackedIds(null), ids());
  assert.deepEqual(m.loadTrackedIds(blocked), ids());
  assert.deepEqual(m.loadTrackedIds(store({ [m.TRACKED_IDS_KEY]: "{not json" })), ids());
  assert.deepEqual(
    m.loadTrackedIds(store({ quotashift_overlay_tracked_provider: "other" })),
    ids(),
  );
});

test("saved ids are cleaned, deduplicated and capped at three", () => {
  const s = store();
  m.saveTrackedIds(ids(["a", "a", "b", "c", "d"], "nope", ["", 4, "z"]), s);
  assert.deepEqual(m.loadTrackedIds(s), ids(["a", "b", "c"], [], ["z"]));
  assert.doesNotThrow(() => m.saveTrackedIds(ids(), blocked));
});

test("multi-track toggles default off and round-trip", () => {
  const s = store();
  assert.deepEqual(m.loadMultiTrack(s), { antigravity: false, codex: false, claude: false });
  m.saveMultiTrack({ antigravity: true, codex: false, claude: true }, s);
  assert.deepEqual(m.loadMultiTrack(s), { antigravity: true, codex: false, claude: true });
  assert.doesNotThrow(() =>
    m.saveMultiTrack({ antigravity: true, codex: true, claude: true }, blocked),
  );
});

test("single mode replaces the tracked account", () => {
  const r = m.toggleTrackedAccount(ids([], ["a"]), "codex", "codex", "b", false);
  assert.equal(r.result, "replaced");
  assert.deepEqual(r.ids.codex, ["b"]);
});

test("multi mode adds, removes and enforces min and max", () => {
  let state = ids([], ["a"]);
  let r = m.toggleTrackedAccount(state, "codex", "codex", "b", true);
  assert.equal(r.result, "added");
  r = m.toggleTrackedAccount(r.ids, "codex", "codex", "c", true);
  assert.deepEqual(r.ids.codex, ["a", "b", "c"]);
  const max = m.toggleTrackedAccount(r.ids, "codex", "codex", "d", true);
  assert.equal(max.result, "max");
  assert.deepEqual(max.ids.codex, ["a", "b", "c"]);
  r = m.toggleTrackedAccount(r.ids, "codex", "codex", "b", true);
  assert.equal(r.result, "removed");
  assert.deepEqual(r.ids.codex, ["a", "c"]);
  state = ids([], ["a"]);
  const min = m.toggleTrackedAccount(state, "codex", "codex", "a", true);
  assert.equal(min.result, "min");
  assert.equal(min.ids, state);
});

test("tracking another provider switches the shown provider", () => {
  let r = m.toggleTrackedAccount(ids([], ["a"]), "codex", "claude", "x", false);
  assert.equal(r.result, "switched");
  assert.equal(r.shown, "claude");
  assert.deepEqual(r.ids.claude, ["x"]);
  r = m.toggleTrackedAccount(ids(["g1"], ["a"]), "codex", "antigravity", "g2", true);
  assert.deepEqual(r.ids.antigravity, ["g1", "g2"]);
  r = m.toggleTrackedAccount(ids(["g1", "g2", "g3"]), "codex", "antigravity", "g4", true);
  assert.deepEqual(r.ids.antigravity, ["g1", "g2", "g3"]);
  r = m.toggleTrackedAccount(ids(["g1"]), "codex", "antigravity", "g1", true);
  assert.deepEqual(r.ids.antigravity, ["g1"]);
  r = m.toggleTrackedAccount(ids(["g1", "g2"]), "codex", "antigravity", "g3", false);
  assert.deepEqual(r.ids.antigravity, ["g3"]);
});

test("trim, prune and tracked lookup", () => {
  const state = ids(["a", "b"], ["c"]);
  assert.deepEqual(m.trimToSingle(state, "antigravity").antigravity, ["a"]);
  assert.equal(m.trimToSingle(state, "codex"), state);
  assert.deepEqual(m.pruneTracked(state, "antigravity", ["b"]).antigravity, ["b"]);
  assert.equal(m.pruneTracked(state, "codex", ["c"]), state);
  assert.equal(m.isAccountTracked(state, "antigravity", "antigravity", "b"), true);
  assert.equal(m.isAccountTracked(state, "codex", "antigravity", "b"), false);
  assert.equal(m.isTrackedProvider("claude"), true);
  assert.equal(m.isTrackedProvider(7), false);
});
