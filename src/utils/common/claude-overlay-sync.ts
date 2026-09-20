const CLAUDE_OVERLAY_DATA_KEY = "quotashift_overlay_data";

export interface ClaudeGuardrailOverlayPreferences {
  fiveHour: { enabled: boolean; thresholdPct: number };
  weekly: { enabled: boolean; thresholdPct: number };
}

export function buildClaudeGuardrailOverlayState(preferences: ClaudeGuardrailOverlayPreferences) {
  return {
    fiveHourEnabled: preferences.fiveHour.enabled,
    fiveHourThresholdPct: preferences.fiveHour.thresholdPct,
    weeklyEnabled: preferences.weekly.enabled,
    weeklyThresholdPct: preferences.weekly.thresholdPct,
  };
}

export function syncClaudeGuardrailsToOverlay(
  preferences: ClaudeGuardrailOverlayPreferences,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(CLAUDE_OVERLAY_DATA_KEY);
    if (!raw) return;
    const current = JSON.parse(raw);
    if (current?.provider !== "claude") return;
    localStorage.setItem(
      CLAUDE_OVERLAY_DATA_KEY,
      JSON.stringify({
        ...current,
        claudeGuardrails: buildClaudeGuardrailOverlayState(preferences),
      }),
    );
  } catch {}
}
