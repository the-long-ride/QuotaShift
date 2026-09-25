import { invoke } from "@tauri-apps/api/core";
import { obfuscate, deobfuscate } from "../../utils/auth/auth";
import type { CodexAccount } from "../../utils/common/types";
import { prepareCodexLocalSessionImport } from "../../utils/codex/local-session-import";
import { completeAccountCapture } from "../../utils/account/capture-completion";
import type { ToastKind } from "../common/Toast";

export function createApiKeyCodexAccount(label: string, apiKey: string): CodexAccount {
  return {
    id: `acct-apikey-${Date.now()}`,
    label,
    apiKey: obfuscate(apiKey),
  };
}

export async function importLocalCodexSession(
  label: string,
  loadAccounts: () => CodexAccount[],
  saveAccounts: (accounts: CodexAccount[]) => void,
): Promise<
  | { status: "error"; error: string }
  | { status: "success"; account: CodexAccount; alreadyPresent: boolean }
> {
  const rawAuth = await invoke<string | null>("read_codex_auth");
  const result = prepareCodexLocalSessionImport(rawAuth, label, loadAccounts());
  if (result.status === "error") return result;
  saveAccounts(result.accounts);
  return { status: "success", account: result.account, alreadyPresent: result.alreadyPresent };
}

export interface ExecuteLocalImportParams {
  label: string;
  loadAccounts: () => CodexAccount[];
  saveAccounts: (accounts: CodexAccount[]) => void;
  onStartFetching: (accountId: string, isOAuth: boolean) => void;
  onAccountsAdded: (accountIds: string[]) => void;
  onClose: () => void;
  showToast: (message: string, kind?: ToastKind) => void;
  setLocalErrorText: (error: string | null) => void;
}

export async function executeCodexLocalSessionImport({
  label,
  loadAccounts,
  saveAccounts,
  onStartFetching,
  onAccountsAdded,
  onClose,
  showToast,
  setLocalErrorText,
}: ExecuteLocalImportParams): Promise<void> {
  const trimmed = label.trim();
  setLocalErrorText(null);
  try {
    const result = await importLocalCodexSession(trimmed, loadAccounts, saveAccounts);
    if (result.status === "error") {
      setLocalErrorText(result.error);
      return;
    }
    if (result.status === "success") {
      onStartFetching(result.account.id, deobfuscate(result.account.apiKey).startsWith("{"));
      onAccountsAdded([result.account.id]);
      completeAccountCapture(
        {
          platformName: "Codex",
          addedCount: result.alreadyPresent ? 0 : 1,
          alreadyPresentCount: result.alreadyPresent ? 1 : 0,
        },
        onClose,
        (message) => showToast(message, "success"),
      );
    }
  } catch (err: any) {
    setLocalErrorText(`Import failed: ${err?.message ?? String(err)}`);
  }
}
