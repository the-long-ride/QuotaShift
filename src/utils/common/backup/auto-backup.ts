import type { AntigravityAccount, CodexAccount } from "../types.js";
import { buildBackupData, encryptBackup } from "./app-backup.js";
import { buildCredentialsBackupData } from "./credentials-backup.js";
import { loadAntigravityAccounts } from "./app-storage.js";
import {
  AUTO_BACKUP_BASE_NAME,
  type AutoBackupConfig,
  type AutoBackupRepeatUnit,
  type AutoBackupScope,
  type AutoBackupStatus,
  buildAutoBackupFileName,
  computeNextAutoBackupRunAt,
  defaultAutoBackupConfig,
  isAutoBackupDue,
  isMissedAutoBackupCatchUp,
  normalizeAutoBackupConfig,
  parseStartTime,
  resolveScheduledNextRunAt,
  validateAutoBackupReady,
} from "./auto-backup-schedule.js";

export {
  AUTO_BACKUP_BASE_NAME,
  type AutoBackupConfig,
  type AutoBackupRepeatUnit,
  type AutoBackupScope,
  type AutoBackupStatus,
  buildAutoBackupFileName,
  computeNextAutoBackupRunAt,
  defaultAutoBackupConfig,
  isAutoBackupDue,
  isMissedAutoBackupCatchUp,
  normalizeAutoBackupConfig,
  parseStartTime,
  resolveScheduledNextRunAt,
  validateAutoBackupReady,
};

export const AUTO_BACKUP_CONFIG_KEY = "quotashift_auto_backup_config_v1";
export const AUTO_BACKUP_PASSPHRASE_KEY = "quotashift_auto_backup_passphrase_v1";
export const AUTO_BACKUP_CHANGED_EVENT = "quotashift_auto_backup_changed";
export const AUTO_BACKUP_RUN_NOW_EVENT = "quotashift_auto_backup_run_now";

function defaultStorage(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

export function loadAutoBackupConfig(storage: Storage | null = defaultStorage()): AutoBackupConfig {
  if (!storage) return defaultAutoBackupConfig();
  try {
    const raw = storage.getItem(AUTO_BACKUP_CONFIG_KEY);
    if (!raw) return defaultAutoBackupConfig();
    return normalizeAutoBackupConfig(JSON.parse(raw));
  } catch {
    return defaultAutoBackupConfig();
  }
}

export function saveAutoBackupConfig(
  config: AutoBackupConfig,
  storage: Storage | null = defaultStorage(),
): AutoBackupConfig {
  const normalized = normalizeAutoBackupConfig(config);
  if (storage) {
    storage.setItem(AUTO_BACKUP_CONFIG_KEY, JSON.stringify(normalized));
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTO_BACKUP_CHANGED_EVENT, { detail: normalized }));
  }
  return normalized;
}

export function loadAutoBackupPassphrase(
  storage: Storage | null = defaultStorage(),
): string | null {
  if (!storage) return null;
  const value = storage.getItem(AUTO_BACKUP_PASSPHRASE_KEY);
  return value && value.length > 0 ? value : null;
}

export function hasAutoBackupPassphrase(storage: Storage | null = defaultStorage()): boolean {
  return loadAutoBackupPassphrase(storage) !== null;
}

export function saveAutoBackupPassphrase(
  passphrase: string,
  storage: Storage | null = defaultStorage(),
): void {
  if (!passphrase) {
    throw new Error("Backup password cannot be empty");
  }
  storage?.setItem(AUTO_BACKUP_PASSPHRASE_KEY, passphrase);
}

export function clearAutoBackupPassphrase(storage: Storage | null = defaultStorage()): void {
  storage?.removeItem(AUTO_BACKUP_PASSPHRASE_KEY);
}

export interface ExecuteAutoBackupRunParams {
  config: AutoBackupConfig;
  passphrase: string;
  antigravityAccounts: AntigravityAccount[];
  codexAccounts: CodexAccount[];
  theme: "dark" | "light";
  writeFile: (dirPath: string, fileName: string, content: string) => Promise<string>;
  now?: Date;
}

export interface ExecuteAutoBackupRunResult {
  fileName: string;
  filePath: string;
  encryptedContent: string;
  nextConfig: AutoBackupConfig;
}

export async function executeAutoBackupRun({
  config,
  passphrase,
  antigravityAccounts,
  codexAccounts,
  theme,
  writeFile,
  now = new Date(),
}: ExecuteAutoBackupRunParams): Promise<ExecuteAutoBackupRunResult> {
  const readinessError = validateAutoBackupReady(config, Boolean(passphrase));
  if (readinessError) {
    throw new Error(readinessError);
  }

  const storedAg = loadAntigravityAccounts();
  const mergedAg = antigravityAccounts.map((mem) => {
    const stored = storedAg.find((entry) => entry.id === mem.id);
    return {
      ...mem,
      refreshToken: mem.refreshToken || stored?.refreshToken,
    };
  });

  const payload =
    config.scope === "credentials"
      ? buildCredentialsBackupData(mergedAg, codexAccounts)
      : buildBackupData(mergedAg, codexAccounts, theme);
  const encryptedContent = await encryptBackup(payload, passphrase);
  const fileName = buildAutoBackupFileName(config, now);
  const filePath = await writeFile(config.directoryPath.trim(), fileName, encryptedContent);
  const runAt = now.getTime();

  return {
    fileName,
    filePath,
    encryptedContent,
    nextConfig: {
      ...config,
      lastRunAt: runAt,
      nextRunAt: computeNextAutoBackupRunAt(config, runAt),
      lastStatus: "success",
      lastError: null,
      lastOutputPath: filePath,
    },
  };
}
