import { invoke } from "@tauri-apps/api/core";
import type { AntigravityAccount, CodexAccount } from "../common/types";
import {
  loadAntigravityAccounts,
  loadCodexAccounts,
  saveAntigravityAccounts,
  saveCodexAccounts,
} from "../common/app-storage";
import { extractAntigravitySessionAccount } from "../antigravity/current-local-session";
import { parseCodexLocalAuth } from "../codex/current-local-session";
import { findAntigravityAccountMatch, findCodexAccountMatch } from "./current-account";
import { markAccountLastUsed } from "./account-last-used";

export interface CurrentSessionLastUsedResult {
  antigravityAccounts: AntigravityAccount[] | null;
  codexAccounts: CodexAccount[] | null;
}

export async function syncCurrentSessionLastUsed(
  usedAt = Date.now(),
): Promise<CurrentSessionLastUsedResult> {
  let antigravityAccounts: AntigravityAccount[] | null = null;
  let codexAccounts: CodexAccount[] | null = null;

  try {
    const session = await invoke("read_antigravity_session");
    const candidate = extractAntigravitySessionAccount(session);
    const accounts = loadAntigravityAccounts();
    const match = candidate ? findAntigravityAccountMatch(accounts, candidate) : undefined;
    if (match) {
      const updated = markAccountLastUsed(accounts, match.id, usedAt);
      if (updated !== accounts) {
        saveAntigravityAccounts(updated);
        antigravityAccounts = updated;
      }
    }
  } catch {}

  try {
    const auth = await invoke("read_codex_auth");
    const candidate = parseCodexLocalAuth(auth);
    const accounts = loadCodexAccounts();
    const match = candidate ? findCodexAccountMatch(accounts, candidate) : undefined;
    if (match) {
      const updated = markAccountLastUsed(accounts, match.id, usedAt);
      if (updated !== accounts) {
        saveCodexAccounts(updated);
        codexAccounts = updated;
      }
    }
  } catch {}

  return { antigravityAccounts, codexAccounts };
}
