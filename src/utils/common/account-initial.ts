/** Pseudo account for the local Claude Code session (not a signed-in account). */
export const CLAUDE_LOCAL_ACCOUNT_ID = "claude-local";

/**
 * Letter shown in place of an avatar image: the first character of the first non-blank name,
 * uppercased. Iterates code points so an emoji or accented alias is not split in half.
 */
export function accountInitial(
  names: ReadonlyArray<string | null | undefined>,
  fallback = "?",
): string {
  for (const name of names) {
    const first = Array.from(name?.trim() ?? "")[0];
    if (first) return first.toUpperCase();
  }
  return fallback;
}

/**
 * Claude exposes no profile picture, so real Claude accounts use the letter avatar. Only the
 * local session (which has no account or alias) keeps the Claude mark.
 */
export function showsClaudeMark(provider: string, accountId: string | null | undefined): boolean {
  return provider === "claude" && (!accountId || accountId === CLAUDE_LOCAL_ACCOUNT_ID);
}
