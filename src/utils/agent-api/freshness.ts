/**
 * The account list may display historical percentages, but only proven
 * successful direct usage fetches can authorize another credential switch.
 */
export function verifiedAgentQuotaTimestamp(
  value: unknown, provider: "antigravity" | "codex",
): number | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const { fetchedAt, error, loading, source, accuracy, isOAuth } = entry;
  const successful = !error && !loading && typeof fetchedAt === "number" &&
    Number.isFinite(fetchedAt) && fetchedAt > 0;
  if (!successful) return null;
  if (provider === "antigravity") {
    if (accuracy !== "exact_grouped" ||
        !(source === "exact" || source === "cloud")) return null;
  } else if (isOAuth !== true) {
    return null;
  }
  return fetchedAt as number;
}
