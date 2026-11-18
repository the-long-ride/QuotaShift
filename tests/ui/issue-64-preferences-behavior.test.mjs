import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_MONITOR_ON_APPLY_KEY,
  UNMONITOR_SAME_PROVIDER_ON_APPLY_KEY,
  appendAppliedAccount,
  applyTrackEntry,
  loadAutoMonitorOnApply,
  loadUnmonitorSameProviderOnApply,
  promoteAppliedAccountToMonitor,
  saveAutoMonitorOnApply,
  saveUnmonitorSameProviderOnApply,
  unmonitorOtherSameProviderAccounts,
} from "../../.test-build/common/settings/auto-monitor-on-apply.js";
import {
  MAX_TRACKED,
  TRACKED_IDS_CHANGED_EVENT,
  loadTrackedList,
} from "../../.test-build/common/accounts/tracked-accounts.js";
import {
  OVERLAY_TRACKED_ACCOUNT_ID_KEY,
  OVERLAY_TRACKED_PROVIDER_KEY,
} from "../../.test-build/common/backup/app-constants.js";
import {
  QUOTA_PERCENT_MODE_CHANGED_EVENT,
  QUOTA_PERCENT_MODE_KEY,
  loadQuotaPercentMode,
  quotaPercentDisplay,
  saveQuotaPercentMode,
} from "../../.test-build/common/settings/quota-percent-mode.js";

test("auto-monitor only appends, does not evict at capacity", () => {
  const tracked = [{ provider: "antigravity", id: "ag1" }, { provider: "codex", id: "cx1" }];
  const next = appendAppliedAccount(tracked, { provider: "claude", id: "cl1" }, false);
  assert.equal(next.result, "added");
  assert.deepEqual(next.list, [...tracked, { provider: "claude", id: "cl1" }]);
  const full = appendAppliedAccount(next.list, { provider: "antigravity", id: "ag2" }, false);
  assert.equal(full.result, "full");
  assert.deepEqual(full.list, next.list);
  assert.equal(full.list, next.list);
});

test("same-provider removal never removes other provider cards", () => {
  const tracked = [
    { provider: "antigravity", id: "ag1" },
    { provider: "codex", id: "cx1" },
    { provider: "antigravity", id: "ag2" },
  ];
  const next = appendAppliedAccount(tracked, { provider: "antigravity", id: "ag3" }, true);
  assert.equal(next.result, "added");
  assert.deepEqual(next.list, [
    { provider: "codex", id: "cx1" },
    { provider: "antigravity", id: "ag3" },
  ]);
  const existing = appendAppliedAccount(tracked, { provider: "codex", id: "cx1" }, false);
  assert.equal(existing.result, "already");
  assert.deepEqual(existing.list, tracked);
});

test("quota inversion preserves missing values and never changes underlying source", () => {
  assert.equal(quotaPercentDisplay(20, false), 20);
  assert.equal(quotaPercentDisplay(20, true), 80);
  assert.equal(quotaPercentDisplay(0, true), 100);
  assert.equal(quotaPercentDisplay(100, true), 0);
  assert.equal(quotaPercentDisplay(null, true), null);
  assert.equal(quotaPercentDisplay(undefined, true), null);
  assert.equal(quotaPercentDisplay(Number.NaN, true), null);
});

test("loadQuotaPercentMode defaults to true (Used) and respects explicit false (Remaining)", () => {
  const prevStorage = globalThis.localStorage;
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
  try {
    assert.equal(loadQuotaPercentMode(), true);
    map.set(QUOTA_PERCENT_MODE_KEY, "false");
    assert.equal(loadQuotaPercentMode(), false);
    map.set(QUOTA_PERCENT_MODE_KEY, "true");
    assert.equal(loadQuotaPercentMode(), true);
  } finally {
    globalThis.localStorage = prevStorage;
  }
});

function withDomMocks(fn) {
  const prevStorage = globalThis.localStorage;
  const prevWindow = globalThis.window;
  const prevCustomEvent = globalThis.CustomEvent;
  const store = new Map();
  const events = [];
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.CustomEvent = class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    dispatchEvent: (event) => {
      events.push(event.type);
      return true;
    },
  };
  try {
    fn({ store, events });
  } finally {
    globalThis.localStorage = prevStorage;
    globalThis.window = prevWindow;
    globalThis.CustomEvent = prevCustomEvent;
  }
}

test("saveQuotaPercentMode persists flag and broadcasts change event", () => {
  withDomMocks(({ store, events }) => {
    saveQuotaPercentMode(false);
    assert.equal(store.get(QUOTA_PERCENT_MODE_KEY), "false");
    assert.equal(loadQuotaPercentMode(), false);
    assert.deepEqual(events, [QUOTA_PERCENT_MODE_CHANGED_EVENT]);
  });
});

test("saveAutoMonitorOnApply and promoteAppliedAccountToMonitor update tracked list safely", () => {
  withDomMocks(({ store, events }) => {
    assert.equal(loadAutoMonitorOnApply(), false);
    assert.equal(loadUnmonitorSameProviderOnApply(), false);

    saveAutoMonitorOnApply(true);
    assert.equal(store.get(AUTO_MONITOR_ON_APPLY_KEY), "true");
    assert.equal(loadAutoMonitorOnApply(), true);

    saveUnmonitorSameProviderOnApply(true);
    assert.equal(store.get(UNMONITOR_SAME_PROVIDER_ON_APPLY_KEY), "true");
    assert.equal(loadUnmonitorSameProviderOnApply(), true);

    assert.equal(promoteAppliedAccountToMonitor("antigravity", "ag-1"), "added");
    assert.equal(store.get(OVERLAY_TRACKED_PROVIDER_KEY), "antigravity");
    assert.equal(store.get(OVERLAY_TRACKED_ACCOUNT_ID_KEY), "ag-1");
    assert.equal(promoteAppliedAccountToMonitor("antigravity", "ag-1"), "already");

    assert.equal(promoteAppliedAccountToMonitor("antigravity", "ag-2"), "added");
    assert.deepEqual(loadTrackedList(), [{ provider: "antigravity", id: "ag-2" }]);
    assert.equal(store.get(OVERLAY_TRACKED_ACCOUNT_ID_KEY), "ag-2");

    saveUnmonitorSameProviderOnApply(false);
    for (let i = 1; i < MAX_TRACKED; i++) {
      assert.equal(promoteAppliedAccountToMonitor("codex", `cx-${i}`), "added");
    }
    assert.equal(promoteAppliedAccountToMonitor("claude", "cl-overflow"), "full");
    assert.ok(events.includes(TRACKED_IDS_CHANGED_EVENT));
  });
});

test("applyTrackEntry unmonitors previous same-provider accounts without touching others", () => {
  const tracked = [
    { provider: "antigravity", id: "ag-1" },
    { provider: "codex", id: "cx-1" },
    { provider: "antigravity", id: "ag-2" },
  ];
  const added = applyTrackEntry(tracked, { provider: "antigravity", id: "ag-3" }, true, true);
  assert.equal(added.result, "added");
  assert.deepEqual(added.list, [
    { provider: "codex", id: "cx-1" },
    { provider: "antigravity", id: "ag-3" },
  ]);

  const toggledOff = applyTrackEntry(tracked, { provider: "antigravity", id: "ag-2" }, true, true);
  assert.equal(toggledOff.result, "removed");
  assert.deepEqual(toggledOff.list, [
    { provider: "antigravity", id: "ag-1" },
    { provider: "codex", id: "cx-1" },
  ]);
});

test("unmonitorOtherSameProviderAccounts works independently of auto-monitor", () => {
  withDomMocks(({ store, events }) => {
    saveAutoMonitorOnApply(false);
    saveUnmonitorSameProviderOnApply(true);
    promoteAppliedAccountToMonitor("antigravity", "ag-1");
    assert.deepEqual(loadTrackedList(), [{ provider: "antigravity", id: "ag-1" }]);

    // Empty when only ag-1 was tracked and ag-2 is applied with auto-monitor off.
    assert.equal(unmonitorOtherSameProviderAccounts("antigravity", "ag-2"), true);
    assert.deepEqual(loadTrackedList(), []);
    assert.equal(store.get(OVERLAY_TRACKED_PROVIDER_KEY), undefined);
    assert.equal(store.get(OVERLAY_TRACKED_ACCOUNT_ID_KEY), undefined);

    // Keeps other providers intact and reassigns primary when previous primary was removed.
    saveAutoMonitorOnApply(true);
    saveUnmonitorSameProviderOnApply(false);
    promoteAppliedAccountToMonitor("antigravity", "ag-1");
    promoteAppliedAccountToMonitor("codex", "cx-1");
    saveAutoMonitorOnApply(false);
    saveUnmonitorSameProviderOnApply(true);
    events.length = 0;

    assert.equal(unmonitorOtherSameProviderAccounts("antigravity", "ag-2"), true);
    assert.deepEqual(loadTrackedList(), [{ provider: "codex", id: "cx-1" }]);
    assert.equal(store.get(OVERLAY_TRACKED_PROVIDER_KEY), "codex");
    assert.equal(store.get(OVERLAY_TRACKED_ACCOUNT_ID_KEY), "cx-1");
    assert.ok(events.includes(TRACKED_IDS_CHANGED_EVENT));
  });
});
