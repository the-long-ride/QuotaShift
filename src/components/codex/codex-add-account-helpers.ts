import { invoke } from "@tauri-apps/api/core";
import { obfuscate } from "../../utils/auth/auth";
import type { CodexAccount } from "../../utils/common/types";
import { prepareCodexLocalSessionImport } from "../../utils/codex/local-session-import";

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
