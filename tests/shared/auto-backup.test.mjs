import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => mockStorage.get(k) ?? null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
  key: (i) => Array.from(mockStorage.keys())[i] ?? null,
  get length() {
    return mockStorage.size;
  },
};

import {
  AUTO_BACKUP_PASSPHRASE_KEY,
  buildAutoBackupFileName,
  clearAutoBackupPassphrase,
  computeNextAutoBackupRunAt,
  defaultAutoBackupConfig,
  executeAutoBackupRun,
  hasAutoBackupPassphrase,
  isAutoBackupDue,
  isMissedAutoBackupCatchUp,
  loadAutoBackupConfig,
  loadAutoBackupPassphrase,
  normalizeAutoBackupConfig,
  resolveScheduledNextRunAt,
  saveAutoBackupConfig,
  saveAutoBackupPassphrase,
  validateAutoBackupReady,
} from "../../.test-build/common/backup/auto-backup.js";
import { decryptBackup, restoreBackupData } from "../../.test-build/common/backup/app-backup.js";
import { restoreCredentialsData } from "../../.test-build/common/backup/credentials-backup.js";
import { isSensitiveStorageKey } from "../../.test-build/auth/secure-storage-types.js";
import { loadCodexPools, saveCodexPools } from "../../.test-build/common/backup/app-storage.js";
import { THEME_KEY } from "../../.test-build/common/backup/app-constants.js";

test("ER-1: computeNextAutoBackupRunAt handles daily, hourly, cross-midnight, and catch-up states", () => {
  const baseMorning = new Date(2026, 10, 28, 10, 15, 0, 0).getTime();
  const nextSameDay = computeNextAutoBackupRunAt(
    { startTime: "23:00", repeatEvery: 1, repeatUnit: "days" },
    baseMorning,
  );
  const sameDayDate = new Date(nextSameDay);
  assert.equal(sameDayDate.getFullYear(), 2026);
  assert.equal(sameDayDate.getMonth(), 10);
  assert.equal(sameDayDate.getDate(), 28);
  assert.equal(sameDayDate.getHours(), 23);
  assert.equal(sameDayDate.getMinutes(), 0);

  const afterTarget = new Date(2026, 10, 28, 23, 30, 0, 0).getTime();
  const nextMultiDay = computeNextAutoBackupRunAt(
    { startTime: "23:00", repeatEvery: 2, repeatUnit: "days" },
    afterTarget,
  );
  assert.equal(new Date(nextMultiDay).getDate(), 30);

  const lateNight = new Date(2026, 10, 28, 22, 30, 0, 0).getTime();
  const nextHourly = computeNextAutoBackupRunAt(
    { startTime: "20:00", repeatEvery: 4, repeatUnit: "hours" },
    lateNight,
  );
  const hourlyDate = new Date(nextHourly);
  assert.equal(hourlyDate.getDate(), 29);
  assert.equal(hourlyDate.getHours(), 0);
  assert.equal(hourlyDate.getMinutes(), 0);

  const cfg = { ...defaultAutoBackupConfig(), enabled: true, nextRunAt: lateNight - 1000 };
  assert.equal(isAutoBackupDue(cfg, lateNight), true);
  assert.equal(isAutoBackupDue({ ...cfg, enabled: false }, lateNight), false);
  assert.equal(isAutoBackupDue(cfg, lateNight - 2000), false);

  const normalized = normalizeAutoBackupConfig({ startTime: "99:99", repeatEvery: -5, repeatUnit: "hours" });
  assert.equal(normalized.startTime, "23:00");
  assert.equal(normalized.repeatEvery, 1);
});

test("ER-2: buildAutoBackupFileName follows Overwrite ON, Days date, and Hours timestamp rules", () => {
  const sampleDate = new Date(2026, 10, 28, 7, 5, 0, 0);
  assert.equal(
    buildAutoBackupFileName({ overwriteExisting: true, repeatUnit: "days" }, sampleDate),
    "QuotaShift-Backup.json",
  );
  assert.equal(
    buildAutoBackupFileName({ overwriteExisting: true, repeatUnit: "hours" }, sampleDate),
    "QuotaShift-Backup.json",
  );
  assert.equal(
    buildAutoBackupFileName({ overwriteExisting: false, repeatUnit: "days" }, sampleDate),
    "QuotaShift-Backup-2026-11-28.json",
  );
  assert.equal(
    buildAutoBackupFileName({ overwriteExisting: false, repeatUnit: "hours" }, sampleDate),
    "QuotaShift-Backup-2026-11-28_07-05.json",
  );
});

test("ER-3 & ER-4: executeAutoBackupRun encrypts manual-compatible Full & Credentials backups and applies password edits on next run", async () => {
  mockStorage.clear();
  localStorage.setItem(THEME_KEY, "dark");
  saveCodexPools([{ id: "pool-1", name: "Pool 1", model: "gpt-5.3-codex", accountIds: ["cx-1"] }]);

  const files = new Map();
  const writeFile = async (dirPath, fileName, content) => {
    const full = path.join(dirPath, fileName);
    files.set(full, content);
    return full;
  };

  assert.equal(isSensitiveStorageKey(AUTO_BACKUP_PASSPHRASE_KEY), true);
  saveAutoBackupPassphrase("pass-v1");
  assert.equal(hasAutoBackupPassphrase(), true);

  let cfg = saveAutoBackupConfig({
    ...defaultAutoBackupConfig(),
    enabled: true,
    scope: "full",
    startTime: "09:00",
    repeatEvery: 1,
    repeatUnit: "days",
    directoryPath: "/tmp/qs-auto",
    overwriteExisting: false,
  });
  assert.equal(validateAutoBackupReady(cfg, hasAutoBackupPassphrase()), null);

  const ag = [
    { id: "ag-1", label: "AG 1", email: "ag1@test.com", token: "tok-1", refreshToken: "ref-1" },
  ];
  const cx = [{ id: "cx-1", label: "CX 1", email: "cx1@test.com", apiKey: "sk-1" }];

  const run1 = await executeAutoBackupRun({
    config: cfg,
    passphrase: loadAutoBackupPassphrase(),
    antigravityAccounts: ag,
    codexAccounts: cx,
    theme: "dark",
    writeFile,
    now: new Date(2026, 10, 28, 9, 0, 0, 0),
  });
  assert.equal(run1.fileName, "QuotaShift-Backup-2026-11-28.json");
  assert.equal(run1.nextConfig.lastStatus, "success");
  assert.ok(run1.nextConfig.nextRunAt > new Date(2026, 10, 28, 9, 0, 0, 0).getTime());

  // Rotate passphrase before the next run; run1 keeps working with pass-v1
  saveAutoBackupPassphrase("pass-v2");
  const decryptedRun1 = await decryptBackup(files.get(run1.filePath), "pass-v1");
  assert.equal(decryptedRun1.version, 3);
  await assert.rejects(() => decryptBackup(files.get(run1.filePath), "pass-v2"));

  // Next run as credentials-only encrypts with pass-v2 and produces v1 credentials payload
  cfg = {
    ...run1.nextConfig,
    scope: "credentials",
    repeatUnit: "hours",
    repeatEvery: 6,
  };
  const run2 = await executeAutoBackupRun({
    config: cfg,
    passphrase: loadAutoBackupPassphrase(),
    antigravityAccounts: ag,
    codexAccounts: cx,
    theme: "dark",
    writeFile,
    now: new Date(2026, 10, 28, 15, 30, 0, 0),
  });
  assert.equal(run2.fileName, "QuotaShift-Backup-2026-11-28_15-30.json");
  await assert.rejects(() => decryptBackup(files.get(run2.filePath), "pass-v1"));
  const decryptedRun2 = await decryptBackup(files.get(run2.filePath), "pass-v2");
  assert.equal(decryptedRun2.type, "quotashift_credentials_backup");

  // Round-trip restore verification for both Full v3 and Credentials v1
  mockStorage.clear();
  const restoredFull = restoreBackupData(decryptedRun1, [], [], []);
  assert.equal(restoredFull.importedAntigravityCount, 1);
  assert.equal(restoredFull.importedCodexCount, 1);
  assert.equal(loadCodexPools().length, 1);

  mockStorage.clear();
  const restoredCreds = restoreCredentialsData(decryptedRun2, [], []);
  assert.equal(restoredCreds.importedAntigravityCount, 1);
  assert.equal(restoredCreds.importedCodexCount, 1);
  assert.equal(loadAutoBackupConfig().directoryPath, "");

  clearAutoBackupPassphrase();
  assert.equal(hasAutoBackupPassphrase(), false);
});

test("ER-1 fallback: opening QuotaShift after a missed 12:00 PM schedule runs catch-up immediately and avoids duplicate runs", async () => {
  mockStorage.clear();
  const scheduledNoon = new Date(2026, 10, 28, 12, 0, 0, 0);
  const openedAtAfternoon = new Date(2026, 10, 28, 15, 30, 0, 0);
  const reopenedLater = new Date(2026, 10, 28, 16, 0, 0, 0);

  let cfg = {
    ...defaultAutoBackupConfig(),
    enabled: true,
    startTime: "12:00",
    repeatEvery: 1,
    repeatUnit: "days",
    directoryPath: "/tmp/qs-catchup",
    overwriteExisting: false,
    nextRunAt: scheduledNoon.getTime(),
  };

  assert.equal(isAutoBackupDue(cfg, openedAtAfternoon.getTime()), true);
  assert.equal(isMissedAutoBackupCatchUp(cfg.nextRunAt, openedAtAfternoon.getTime()), true);

  const written = [];
  const res = await executeAutoBackupRun({
    config: cfg,
    passphrase: "catchup-pass",
    antigravityAccounts: [],
    codexAccounts: [],
    theme: "dark",
    writeFile: async (dir, name, content) => {
      written.push({ dir, name, content });
      return path.join(dir, name);
    },
    now: openedAtAfternoon,
  });
  assert.equal(written.length, 1);
  assert.equal(written[0].name, "QuotaShift-Backup-2026-11-28.json");
  assert.equal(isAutoBackupDue(res.nextConfig, reopenedLater.getTime()), false);
  const nextRunDate = new Date(res.nextConfig.nextRunAt);
  assert.equal(nextRunDate.getDate(), 29);
  assert.equal(nextRunDate.getHours(), 12);

  // If nextRunAt was missing but lastRunAt was yesterday at 12:00 PM, resolveScheduledNextRunAt still catches today's 12:00 PM miss
  const missingNext = {
    ...cfg,
    nextRunAt: null,
    lastRunAt: new Date(2026, 10, 27, 12, 0, 0, 0).getTime(),
  };
  const resolved = resolveScheduledNextRunAt(missingNext, openedAtAfternoon.getTime());
  assert.equal(resolved, scheduledNoon.getTime());
  assert.equal(
    isAutoBackupDue({ ...missingNext, nextRunAt: resolved }, openedAtAfternoon.getTime()),
    true,
  );
});

test("ER-5 & ER-6: SettingsModal, useAutoBackup, and Rust command wiring contracts hold", () => {
  const modal = fs.readFileSync("src/components/common/settings/SettingsModal.tsx", "utf8");
  const section = fs.readFileSync("src/components/common/settings/AutoBackupSection.tsx", "utf8");
  const hook = fs.readFileSync("src/hooks/app/useAutoBackup.ts", "utf8");
  const coordinator = fs.readFileSync("src/hooks/app/useAppCoordinator.ts", "utf8");
  const libRs = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");

  assert.match(modal, /Full Backup[\s\S]*<AutoBackupSection\s*\/>/);
  assert.match(section, /Enable scheduled backup/);
  assert.match(section, /settings-segmented-switch/);
  assert.match(section, /auto-backup-body/);
  assert.match(section, /auto-backup-required/);
  assert.match(section, /Overwrite existing file/);
  assert.match(section, /pick_auto_backup_folder/);
  assert.match(section, /Back up now/);
  assert.match(
    fs.readFileSync("src/components/common/settings/AutoBackupPasswordRow.tsx", "utf8"),
    /auto-backup-required/,
  );
  assert.match(hook, /addEventListener\("focus"/);
  assert.match(hook, /addEventListener\("visibilitychange"/);
  assert.match(coordinator, /useAutoBackup\(/);
  assert.match(libRs, /app::auto_backup::write_auto_backup_file/);
  assert.match(libRs, /app::auto_backup::pick_auto_backup_folder/);
  assert.match(css, /@import "\.\/styles\/settings\/auto-backup\.css";/);
});
