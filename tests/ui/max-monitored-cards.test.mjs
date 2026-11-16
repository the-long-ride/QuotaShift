import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  MAX_MONITORED_CARDS_DEFAULT,
  MAX_MONITORED_CARDS_KEY,
  MAX_MONITORED_CARDS_MAX,
  MAX_MONITORED_CARDS_MIN,
  loadMaxMonitoredCards,
  normalizeMaxMonitoredCards,
  saveMaxMonitoredCards,
} from "../../.test-build/common/settings/max-monitored-cards.js";
import { BACKUP_SETTING_KEYS } from "../../.test-build/common/backup/settings-backup.js";

const read = (rel) => readFileSync(path.resolve(rel), "utf8");

const memoryStorage = (init = {}) => {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
};

test("max monitored cards normalizes, loads, clamps 1..20, and persists", () => {
  assert.equal(MAX_MONITORED_CARDS_DEFAULT, 3);
  assert.equal(MAX_MONITORED_CARDS_MIN, 1);
  assert.equal(MAX_MONITORED_CARDS_MAX, 20);

  assert.equal(normalizeMaxMonitoredCards(undefined), 3);
  assert.equal(normalizeMaxMonitoredCards(NaN), 3);
  assert.equal(normalizeMaxMonitoredCards(0), 1);
  assert.equal(normalizeMaxMonitoredCards(-4), 1);
  assert.equal(normalizeMaxMonitoredCards(25), 20);
  assert.equal(normalizeMaxMonitoredCards(7.6), 8);

  const emptyStore = memoryStorage();
  assert.equal(loadMaxMonitoredCards(emptyStore), 3);
  assert.equal(loadMaxMonitoredCards(memoryStorage({ [MAX_MONITORED_CARDS_KEY]: "" })), 3);
  assert.equal(loadMaxMonitoredCards(memoryStorage({ [MAX_MONITORED_CARDS_KEY]: "12" })), 12);
  assert.equal(loadMaxMonitoredCards(memoryStorage({ [MAX_MONITORED_CARDS_KEY]: "99" })), 20);

  assert.equal(saveMaxMonitoredCards(15, emptyStore), 15);
  assert.equal(emptyStore.getItem(MAX_MONITORED_CARDS_KEY), "15");
  assert.equal(loadMaxMonitoredCards(emptyStore), 15);
  assert.ok(BACKUP_SETTING_KEYS.includes(MAX_MONITORED_CARDS_KEY));
});

test("Appearance groups CardView + QuotaDisplay in General, followed by Platform and Monitored Display with max cards 1..20", () => {
  const appearance = read("src/components/common/settings/AppearanceSettingsSection.tsx");
  const behavior = read("src/components/common/settings/BehaviorSettingsSection.tsx");
  const maxRow = read("src/components/common/settings-fields/MaxMonitoredCardsRow.tsx");

  assert.doesNotMatch(behavior, /QuotaPercentModeSetting|Quota Display/);

  const generalIdx = appearance.indexOf('>General<');
  const cardViewIdx = appearance.indexOf('<CardViewSetting');
  const quotaIdx = appearance.indexOf('<QuotaPercentModeSetting');
  const platformIdx = appearance.indexOf('>Platform<');
  const monitoredIdx = appearance.indexOf('>Monitored Display<');
  const maxRowIdx = appearance.indexOf('<MaxMonitoredCardsRow');

  assert.ok(generalIdx >= 0);
  assert.ok(generalIdx < cardViewIdx && cardViewIdx < quotaIdx);
  assert.ok(quotaIdx < platformIdx && platformIdx < monitoredIdx);
  assert.ok(monitoredIdx < maxRowIdx);

  assert.match(maxRow, /id="max-monitored-cards"/);
  assert.match(maxRow, /min=\{MAX_MONITORED_CARDS_MIN\}/);
  assert.match(maxRow, /max=\{MAX_MONITORED_CARDS_MAX\}/);
  assert.match(maxRow, /Max monitored account cards/);
});

test("Card, Circle, Taskbar, and SizingBridge respect configured max monitored cards up to 20", () => {
  const cardStack = read("src/components/overlay/OverlayCardStack.tsx");
  const circleStack = read("src/components/overlay/OverlayCircleStack.tsx");
  const taskbarApp = read("src/components/taskbar/TaskbarApp.tsx");
  const bridge = read("src/components/overlay/OverlayWindowSizingBridge.tsx");

  assert.match(cardStack, /useMaxMonitoredCards\(\)/);
  assert.match(circleStack, /useMaxMonitoredCards\(\)/);
  assert.match(taskbarApp, /useMaxMonitoredCards\(\)/);
  assert.match(bridge, /maxRows:\s*MAX_MONITORED_CARDS_MAX/);
});
