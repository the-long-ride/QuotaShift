export type CodexUsageWindowKind =
  | "5h"
  | "daily"
  | "weekly"
  | "monthly"
  | "annual"
  | "unknown";

export interface CodexUsageWindow {
  kind: CodexUsageWindowKind;
  label: string;
  usedPercent: number;
  resetAt: number | null;
  durationMinutes: number | null;
  window: any;
}

const WINDOW_KEYS = [
  "primary_window",
  "secondary_window",
  "weekly_window",
  "monthly_window",
  "month_window",
] as const;

const APPROXIMATE_WINDOWS: Array<{
  kind: Exclude<CodexUsageWindowKind, "unknown">;
  minutes: number;
  label: string;
}> = [
  { kind: "5h", minutes: 5 * 60, label: "5h limit" },
  { kind: "daily", minutes: 24 * 60, label: "Daily limit" },
  { kind: "weekly", minutes: 7 * 24 * 60, label: "Weekly limit" },
  { kind: "monthly", minutes: 30 * 24 * 60, label: "Monthly limit" },
  { kind: "annual", minutes: 365 * 24 * 60, label: "Annual limit" },
];

const finiteNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
};

const durationMinutesForWindow = (window: any): number | null => {
  if (!window || typeof window !== "object") return null;

  const explicitMinutes = [
    window.window_duration_mins,
    window.window_minutes,
    window.duration_minutes,
  ]
    .map(finiteNumber)
    .find((value): value is number => value !== null && value > 0);
  if (explicitMinutes !== undefined) return explicitMinutes;

  const seconds = finiteNumber(window.limit_window_seconds);
  if (seconds !== null && seconds > 0) return seconds / 60;

  return null;
};

const classifyDuration = (
  durationMinutes: number | null,
): { kind: CodexUsageWindowKind; label: string } => {
  if (durationMinutes !== null) {
    for (const candidate of APPROXIMATE_WINDOWS) {
      const ratio = durationMinutes / candidate.minutes;
      if (ratio >= 0.95 && ratio <= 1.05) {
        return { kind: candidate.kind, label: candidate.label };
      }
    }
  }

  return { kind: "unknown", label: "Usage limit" };
};

const makeDeduplicationKey = (item: CodexUsageWindow): string => {
  const duration = item.durationMinutes === null ? "unknown" : Math.round(item.durationMinutes * 1000) / 1000;
  return `${duration}:${item.resetAt ?? "none"}:${item.usedPercent}`;
};

export const normalizeCodexUsageWindows = (rateLimit: any): CodexUsageWindow[] => {
  if (!rateLimit || typeof rateLimit !== "object") return [];

  const normalized: CodexUsageWindow[] = [];
  const seen = new Set<string>();

  for (const key of WINDOW_KEYS) {
    const window = rateLimit[key];
    if (!window || typeof window !== "object") continue;

    const durationMinutes = durationMinutesForWindow(window);
    const classification = classifyDuration(durationMinutes);
    const usedPercent = Math.min(100, Math.max(0, finiteNumber(window.used_percent) ?? 0));
    const resetAt = finiteNumber(window.reset_at);
    const item: CodexUsageWindow = {
      kind: classification.kind,
      label: classification.label,
      usedPercent,
      resetAt,
      durationMinutes,
      window,
    };
    const dedupeKey = makeDeduplicationKey(item);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(item);
  }

  normalized.sort((a, b) => {
    if (a.durationMinutes === null && b.durationMinutes === null) return 0;
    if (a.durationMinutes === null) return 1;
    if (b.durationMinutes === null) return -1;
    return a.durationMinutes - b.durationMinutes;
  });

  return normalized;
};
