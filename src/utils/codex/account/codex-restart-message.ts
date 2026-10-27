/** Toast copy after a Codex account switch, based on which running apps were restarted. */

export interface CodexRestartOutcome {
  cliKilled: boolean;
  desktopKilled: boolean;
  ideExtensionKilled: boolean;
  desktopRelaunched: boolean;
  /** Rust-built sentence(s) about where each CLI was resumed. */
  cliSummary?: string | null;
}

export function buildCodexRestartMessage(outcome: CodexRestartOutcome, label: string): string {
  const parts: string[] = [];
  if (outcome.desktopKilled) {
    parts.push(outcome.desktopRelaunched ? "desktop app restarted" : "reopen the desktop app");
  }
  if (outcome.ideExtensionKilled) {
    parts.push("VS Code extension reconnecting (reload the window if it does not)");
  }
  if (outcome.cliKilled && !outcome.cliSummary) {
    parts.push("CLI stopped — run `codex resume` to continue");
  }
  const head = `Applied Codex account: ${label}`;
  const first = parts.length ? `${head}. ${parts.join("; ")}.` : head;
  return outcome.cliSummary ? `${parts.length ? first : `${head}.`} ${outcome.cliSummary}` : first;
}

export function buildCodexNoRestartMessage(label: string): string {
  return `Applied Codex account: ${label}. Running Codex apps keep the old account until restarted.`;
}
