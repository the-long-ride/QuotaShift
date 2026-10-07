export type TrackedProviderTab = "antigravity" | "codex" | "claude";

export const resolveTrackedProviderTab = (
  savedProvider: string | null,
  monitoredCodex = false,
): TrackedProviderTab => {
  if (savedProvider === "claude") return "claude";
  if (savedProvider === "codex") return "codex";
  if (savedProvider === "antigravity") return "antigravity";
  return monitoredCodex ? "codex" : "antigravity";
};

export const resolveFallbackShownTab = (
  savedProvider: string | null,
  visibility: Record<string, boolean>,
  monitoredCodex = false,
): TrackedProviderTab | null => {
  const preferred = resolveTrackedProviderTab(savedProvider, monitoredCodex);
  return visibility[preferred] ? preferred : null;
};
