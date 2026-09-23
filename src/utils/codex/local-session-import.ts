import { findCodexAccountMatch } from "../account/current-account.js";
import type { CodexAccount } from "../common/types";
import { parseCodexLocalAuth } from "./current-local-session.js";

export type CodexLocalSessionImportResult =
  | { status: "error"; error: string }
  | { status: "success"; account: CodexAccount; accounts: CodexAccount[]; alreadyPresent: boolean };

export function prepareCodexLocalSessionImport(
  rawAuth: string | null,
  label: string,
  accounts: CodexAccount[],
): CodexLocalSessionImportResult {
  if (!rawAuth) {
    return {
      status: "error",
      error: "No Codex CLI session found at ~/.codex/auth.json. Log in via CLI first.",
    };
  }

  let authData: unknown;
  try {
    authData = JSON.parse(rawAuth);
  } catch {
    return { status: "error", error: "Failed to parse auth.json. The file is empty or invalid." };
  }
  if (!authData) {
    return { status: "error", error: "Failed to parse auth.json. The file is empty or invalid." };
  }

  const importedAccount = parseCodexLocalAuth(authData, label);
  if (!importedAccount) {
    return {
      status: "error",
      error: "auth.json does not contain valid ChatGPT tokens or OpenAI API Key.",
    };
  }

  const existingAccount = findCodexAccountMatch(accounts, importedAccount);
  if (!existingAccount) {
    return {
      status: "success",
      account: importedAccount,
      accounts: [...accounts, importedAccount],
      alreadyPresent: false,
    };
  }

  const account = { ...importedAccount, id: existingAccount.id };
  return {
    status: "success",
    account,
    accounts: accounts.map((candidate) => (candidate === existingAccount ? account : candidate)),
    alreadyPresent: true,
  };
}
