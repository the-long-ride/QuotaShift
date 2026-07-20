export type CodexRateLimitWindow = Record<string, unknown> & {
  used_percent?: number;
  reset_at?: number;
  limit_window_seconds?: number;
  window_minutes?: number;
};

export interface NormalizedCodexRateLimits {
  primary: CodexRateLimitWindow | null;
  secondary: CodexRateLimitWindow | null;
  monthly: CodexRateLimitWindow | null;
  raw: Record<string, unknown>;
}

type WindowKind = "session" | "weekly" | "monthly";
type WindowHint = "primary" | "secondary" | "weekly" | "monthly";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const firstNumber = (record: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = asFiniteNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
};

const normalizeWindow = (value: unknown): CodexRateLimitWindow | null => {
  const source = asRecord(value);
  if (!source) return null;

  const normalized: CodexRateLimitWindow = { ...source };
  const usedPercent = firstNumber(source, ["used_percent", "usedPercent", "usage_percent", "usagePercent"]);
  const resetAt = firstNumber(source, ["reset_at", "resets_at", "resetAt", "resetsAt"]);
  const windowSeconds = firstNumber(source, [
    "limit_window_seconds",
    "window_seconds",
    "window_duration_seconds",
    "window_size_seconds",
    "limitWindowSeconds",
    "windowSeconds",
  ]);
  const windowMinutes = firstNumber(source, ["window_minutes", "windowMinutes"]);

  if (usedPercent !== null) normalized.used_percent = usedPercent;
  if (resetAt !== null) normalized.reset_at = resetAt;
  if (windowSeconds !== null) normalized.limit_window_seconds = windowSeconds;
  if (windowMinutes !== null) normalized.window_minutes = windowMinutes;

  return normalized;
};

const getWindowSeconds = (window: CodexRateLimitWindow): number | null => {
  const seconds = asFiniteNumber(window.limit_window_seconds);
  if (seconds !== null && seconds > 0) return seconds;

  const minutes = asFiniteNumber(window.window_minutes);
  return minutes !== null && minutes > 0 ? minutes * 60 : null;
};

const classifyByDuration = (window: CodexRateLimitWindow): WindowKind | null => {
  const seconds = getWindowSeconds(window);
  if (seconds === null) return null;

  const hour = 60 * 60;
  const day = 24 * hour;
  if (seconds >= 4 * hour && seconds <= 6 * hour) return "session";
  if (seconds >= 6 * day && seconds <= 8 * day) return "weekly";
  if (seconds >= 27 * day && seconds <= 32 * day) return "monthly";
  return null;
};

const classifyByMetadata = (window: CodexRateLimitWindow): WindowKind | null => {
  for (const key of ["period", "window_type", "limit_type", "type", "window_period"]) {
    const value = window[key];
    if (typeof value !== "string") continue;
    const normalized = value.toLowerCase().replace(/[\s_-]+/g, "");
    if (normalized.includes("week") || normalized === "7d" || normalized === "168h") return "weekly";
    if (normalized.includes("month") || normalized === "30d" || normalized === "720h") return "monthly";
    if (normalized.includes("session") || normalized === "5h" || normalized === "300m") return "session";
  }
  return null;
};

const usedPercent = (window: CodexRateLimitWindow): number =>
  asFiniteNumber(window.used_percent) ?? -1;

const mergeConservatively = (
  current: CodexRateLimitWindow | null,
  candidate: CodexRateLimitWindow,
): CodexRateLimitWindow => {
  if (!current) return candidate;

  const preferred = usedPercent(candidate) > usedPercent(current) ? candidate : current;
  const other = preferred === candidate ? current : candidate;
  return { ...other, ...preferred };
};

const findRateLimitContainers = (payload: unknown): Record<string, unknown>[] => {
  const root = asRecord(payload);
  if (!root) return [];

  const nestedRecords = [asRecord(root.usage), asRecord(root.data)].filter(
    (record): record is Record<string, unknown> => record !== null,
  );
  const parents = [root, ...nestedRecords];
  const containers: Record<string, unknown>[] = [];

  for (const parent of parents) {
    for (const key of ["rate_limit", "rate_limits"]) {
      const container = asRecord(parent[key]);
      if (container && !containers.includes(container)) containers.push(container);
    }
  }

  if (
    ["primary_window", "secondary_window", "weekly_window", "monthly_window", "primary", "secondary"].some(
      (key) => root[key] !== undefined,
    )
  ) {
    containers.push(root);
  }

  return containers;
};

export const normalizeCodexRateLimits = (
  payload: unknown,
  planType = "free",
): NormalizedCodexRateLimits => {
  const containers = findRateLimitContainers(payload);
  const raw = containers[0] ?? {};
  let primary: CodexRateLimitWindow | null = null;
  let secondary: CodexRateLimitWindow | null = null;
  let monthly: CodexRateLimitWindow | null = null;

  const candidates: Array<{ hint: WindowHint; value: unknown }> = [];
  for (const container of containers) {
    candidates.push(
      { hint: "primary", value: container.primary_window ?? container.primary },
      { hint: "secondary", value: container.secondary_window ?? container.secondary },
      { hint: "weekly", value: container.weekly_window ?? container.weekly },
      { hint: "monthly", value: container.monthly_window ?? container.month_window ?? container.monthly },
    );
  }

  for (const candidate of candidates) {
    const window = normalizeWindow(candidate.value);
    if (!window) continue;

    let kind = classifyByDuration(window) ?? classifyByMetadata(window);
    if (!kind) {
      if (candidate.hint === "primary") kind = "session";
      else if (candidate.hint === "secondary" || candidate.hint === "weekly") kind = "weekly";
      else kind = planType.toLowerCase() === "free" ? "monthly" : "weekly";
    }

    if (kind === "session") primary = mergeConservatively(primary, window);
    else if (kind === "weekly") secondary = mergeConservatively(secondary, window);
    else monthly = mergeConservatively(monthly, window);
  }

  return { primary, secondary, monthly, raw };
};
