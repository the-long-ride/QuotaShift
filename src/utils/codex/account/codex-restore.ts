import { invoke } from "@tauri-apps/api/core";
import type { CodexRestartOutcome } from "./codex-restart-message";

/** Preserve native per-process restoration results instead of trusting a summary. */
export async function restoreStoppedCodexCli(outcome: CodexRestartOutcome): Promise<void> {
  if (!outcome.cliKilled) return;
  const report = await invoke<{
    summary: string;
    outcomes: Array<{ method: string; error?: string | null }>;
  }>("restore_codex_cli").catch(() => null);
  outcome.cliSummary = report?.summary || null;
  outcome.cliOutcomes = report?.outcomes ?? null;
}
