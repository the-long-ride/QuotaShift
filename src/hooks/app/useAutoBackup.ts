import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AntigravityAccount, CodexAccount } from "../../utils/common/types";
import type { ToastKind } from "../../components/common/Toast";
import { isSecureStorageHydrated } from "../../utils/auth/secure-storage";
import {
  AUTO_BACKUP_CHANGED_EVENT,
  AUTO_BACKUP_RUN_NOW_EVENT,
  executeAutoBackupRun,
  isAutoBackupDue,
  isMissedAutoBackupCatchUp,
  loadAutoBackupConfig,
  loadAutoBackupPassphrase,
  resolveScheduledNextRunAt,
  saveAutoBackupConfig,
} from "../../utils/common/backup/auto-backup";

const CHECK_INTERVAL_MS = 60_000;
const ERROR_RETRY_DELAY_MS = 5 * 60_000;

export interface UseAutoBackupParams {
  antigravityAccounts: AntigravityAccount[];
  codexAccounts: CodexAccount[];
  isDarkMode: boolean;
  showToast: (message: string, kind?: ToastKind) => void;
}

export function useAutoBackup({
  antigravityAccounts,
  codexAccounts,
  isDarkMode,
  showToast,
}: UseAutoBackupParams): void {
  const latestRef = useRef({ antigravityAccounts, codexAccounts, isDarkMode, showToast });
  latestRef.current = { antigravityAccounts, codexAccounts, isDarkMode, showToast };
  const inFlightRef = useRef(false);
  const lastFailureAtRef = useRef(0);

  useEffect(() => {
    const runBackup = async (manual: boolean) => {
      if (inFlightRef.current || !isSecureStorageHydrated()) return;
      const nowMs = Date.now();
      let config = loadAutoBackupConfig();
      if (!manual) {
        if (!config.enabled) return;
        const resolvedNext = resolveScheduledNextRunAt(config, nowMs);
        if (config.nextRunAt === null && resolvedNext !== null) {
          config = saveAutoBackupConfig({ ...config, nextRunAt: resolvedNext });
        }
        if (!isAutoBackupDue(config, nowMs)) return;
        if (
          lastFailureAtRef.current > 0 &&
          nowMs - lastFailureAtRef.current < ERROR_RETRY_DELAY_MS
        ) {
          return;
        }
      }
      const wasMissedCatchUp = !manual && isMissedAutoBackupCatchUp(config.nextRunAt, nowMs);

      inFlightRef.current = true;
      try {
        const passphrase = loadAutoBackupPassphrase();
        if (!passphrase) {
          throw new Error("Set a backup password before running Auto Backup.");
        }
        const { antigravityAccounts: ag, codexAccounts: cx, isDarkMode: dark } = latestRef.current;
        const result = await executeAutoBackupRun({
          config,
          passphrase,
          antigravityAccounts: ag,
          codexAccounts: cx,
          theme: dark ? "dark" : "light",
          writeFile: (dirPath, fileName, content) =>
            invoke<string>("write_auto_backup_file", { dirPath, fileName, content }),
        });
        lastFailureAtRef.current = 0;
        const finalConfig = {
          ...result.nextConfig,
          nextRunAt: result.nextConfig.enabled ? result.nextConfig.nextRunAt : null,
        };
        saveAutoBackupConfig(finalConfig);
        if (manual) {
          latestRef.current.showToast(`Auto backup saved: ${result.fileName}`, "info");
        } else if (wasMissedCatchUp) {
          latestRef.current.showToast(`Missed auto backup saved: ${result.fileName}`, "info");
        }
      } catch (error: any) {
        const message = error?.message || String(error);
        if (!manual) {
          lastFailureAtRef.current = Date.now();
        }
        saveAutoBackupConfig({
          ...config,
          lastStatus: "error",
          lastError: message,
        });
        latestRef.current.showToast(`Auto backup failed: ${message}`, "error");
      } finally {
        inFlightRef.current = false;
      }
    };

    const handleConfigChange = () => {
      lastFailureAtRef.current = 0;
      void runBackup(false);
    };
    const handleRunNow = () => {
      void runBackup(true);
    };
    const handleResume = () => {
      void runBackup(false);
    };
    const handleVisibilityChange = () => {
      if (typeof document === "undefined" || !document.hidden) {
        void runBackup(false);
      }
    };

    window.addEventListener(AUTO_BACKUP_CHANGED_EVENT, handleConfigChange);
    window.addEventListener(AUTO_BACKUP_RUN_NOW_EVENT, handleRunNow);
    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const timer = window.setInterval(() => {
      void runBackup(false);
    }, CHECK_INTERVAL_MS);

    void runBackup(false);

    return () => {
      window.removeEventListener(AUTO_BACKUP_CHANGED_EVENT, handleConfigChange);
      window.removeEventListener(AUTO_BACKUP_RUN_NOW_EVENT, handleRunNow);
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(timer);
    };
  }, []);
}
