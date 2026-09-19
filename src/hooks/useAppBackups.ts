import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AntigravityAccount, CodexAccount, CodexAccountPool } from "../utils/common/types";
import { loadCodexPools, saveCodexPools } from "../utils/common/app-storage";
import {
  buildBackupData,
  encryptBackup,
  decryptBackup,
  restoreBackupData,
} from "../utils/common/app-backup";
import { exportPoolsToJson, importPoolsFromJson } from "../utils/codex/codex-pools-io";
import type { ToastKind } from "../components/common/Toast";

export interface UseAppBackupsParams {
  antigravityAccounts: AntigravityAccount[];
  setAntigravityAccounts: (accs: AntigravityAccount[]) => void;
  codexAccounts: CodexAccount[];
  setCodexAccounts: (accs: CodexAccount[]) => void;
  setCodexPools: (pools: CodexAccountPool[]) => void;
  isDarkMode: boolean;
  showToast: (message: string, kind?: ToastKind) => void;
  triggerRefresh: (force?: boolean) => Promise<void>;
}

export function useAppBackups({
  antigravityAccounts,
  setAntigravityAccounts,
  codexAccounts,
  setCodexAccounts,
  setCodexPools,
  isDarkMode,
  showToast,
  triggerRefresh,
}: UseAppBackupsParams) {
  const [passOpen, setPassOpen] = useState(false);
  const [passMode, setPassMode] = useState<"export" | "import">("export");
  const [pendingBackup, setPendingBackup] = useState<string | null>(null);
  const [passError, setPassError] = useState("");
  const [exportSuccessPath, setExportSuccessPath] = useState<string | null>(null);

  const handleExportBackup = async () => {
    setPassError("");
    setPassMode("export");
    setPassOpen(true);
  };

  const handleImportBackup = async (content: string) => {
    try {
      await invoke("show_dashboard");
    } catch {}
    setPendingBackup(content);
    setPassError("");
    setPassMode("import");
    setPassOpen(true);
  };

  const handlePassphraseSubmit = async (passphrase: string) => {
    if (passMode === "export") {
      try {
        const data = {
          ...buildBackupData(antigravityAccounts, codexAccounts, isDarkMode ? "dark" : "light"),
          codex: { accounts: codexAccounts, pools: loadCodexPools() },
        };
        const enc = await encryptBackup(data, passphrase);
        const path = await invoke<string>("export_backup_file", { content: enc });
        setPassError("");
        setPassOpen(false);
        setExportSuccessPath(path);
      } catch (e: any) {
        showToast(`Failed to export backup: ${e?.message || e}`, "error");
      }
    } else if (pendingBackup) {
      try {
        const pData: any = await decryptBackup(pendingBackup, passphrase);
        const res = restoreBackupData(pData, antigravityAccounts, codexAccounts, loadCodexPools());
        setAntigravityAccounts(res.accounts.antigravity);
        setCodexAccounts(res.accounts.codex);
        setCodexPools(res.accounts.pools);
        setPassError("");
        setPassOpen(false);
        void triggerRefresh(true);
        showToast(
          `Imported ${res.importedAntigravityCount + res.importedCodexCount} accounts (${res.updatedAntigravityCount + res.updatedCodexCount} updated)`,
          "info",
        );
      } catch {
        setPassError("Invalid passphrase or corrupted backup");
      }
    }
  };

  const handleCloseExportSuccess = async (confirmed: boolean, target: string | null) => {
    setExportSuccessPath(null);
    if (confirmed && target) {
      try {
        await invoke("open_path_in_file_manager", { path: target });
      } catch (e: any) {
        showToast(`Failed to open explorer: ${e?.message || e}`, "error");
      }
    }
  };

  const handleExportPools = (pools: CodexAccountPool[]) => {
    try {
      const json = exportPoolsToJson(pools);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quotashift_pools_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${pools.length} model pool(s)`, "info");
    } catch (e: any) {
      showToast(`Failed to export pools: ${e?.message || e}`, "error");
    }
  };

  const handleImportPools = (content: string, currentPools: CodexAccountPool[]) => {
    const res = importPoolsFromJson(content, currentPools, codexAccounts);
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
    saveCodexPools(res.pools);
    setCodexPools(res.pools);
    showToast(`Imported ${res.importedCount} pool(s) (${res.updatedCount} updated)`, "info");
  };

  return {
    passOpen,
    setPassOpen,
    passMode,
    passError,
    clearPassError: () => setPassError(""),
    pendingBackup,
    exportSuccessPath,
    setExportSuccessPath,
    handleExportBackup,
    handleImportBackup,
    handlePassphraseSubmit,
    handleCloseExportSuccess,
    handleExportPools,
    handleImportPools,
  };
}
