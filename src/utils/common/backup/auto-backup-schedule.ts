export const AUTO_BACKUP_BASE_NAME = "QuotaShift-Backup";

export type AutoBackupScope = "full" | "credentials";
export type AutoBackupRepeatUnit = "hours" | "days";
export type AutoBackupStatus = "idle" | "success" | "error";

export interface AutoBackupConfig {
  enabled: boolean;
  scope: AutoBackupScope;
  startTime: string;
  repeatEvery: number;
  repeatUnit: AutoBackupRepeatUnit;
  directoryPath: string;
  overwriteExisting: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastStatus: AutoBackupStatus;
  lastError: string | null;
  lastOutputPath: string | null;
}

const DEFAULT_START_TIME = "23:00";
const HOUR_MS = 60 * 60 * 1000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function defaultAutoBackupConfig(): AutoBackupConfig {
  return {
    enabled: false,
    scope: "full",
    startTime: DEFAULT_START_TIME,
    repeatEvery: 1,
    repeatUnit: "days",
    directoryPath: "",
    overwriteExisting: true,
    lastRunAt: null,
    nextRunAt: null,
    lastStatus: "idle",
    lastError: null,
    lastOutputPath: null,
  };
}

export function parseStartTime(startTime: string | null | undefined): {
  hour: number;
  minute: number;
} {
  if (typeof startTime === "string") {
    const match = startTime.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return { hour, minute };
      }
    }
  }
  return { hour: 23, minute: 0 };
}

export function normalizeAutoBackupConfig(raw: unknown): AutoBackupConfig {
  const base = defaultAutoBackupConfig();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const input = raw as Record<string, unknown>;
  const repeatUnit: AutoBackupRepeatUnit = input.repeatUnit === "hours" ? "hours" : "days";
  const maxRepeat = repeatUnit === "hours" ? 168 : 365;
  const parsedRepeat =
    typeof input.repeatEvery === "number" && Number.isFinite(input.repeatEvery)
      ? Math.round(input.repeatEvery)
      : 1;
  const { hour, minute } = parseStartTime(
    typeof input.startTime === "string" ? input.startTime : null,
  );

  return {
    enabled: input.enabled === true,
    scope: input.scope === "credentials" ? "credentials" : "full",
    startTime: `${pad2(hour)}:${pad2(minute)}`,
    repeatEvery: Math.min(maxRepeat, Math.max(1, parsedRepeat)),
    repeatUnit,
    directoryPath: typeof input.directoryPath === "string" ? input.directoryPath.trim() : "",
    overwriteExisting: input.overwriteExisting !== false,
    lastRunAt:
      typeof input.lastRunAt === "number" && Number.isFinite(input.lastRunAt)
        ? input.lastRunAt
        : null,
    nextRunAt:
      typeof input.nextRunAt === "number" && Number.isFinite(input.nextRunAt)
        ? input.nextRunAt
        : null,
    lastStatus:
      input.lastStatus === "success" || input.lastStatus === "error" ? input.lastStatus : "idle",
    lastError: typeof input.lastError === "string" ? input.lastError : null,
    lastOutputPath: typeof input.lastOutputPath === "string" ? input.lastOutputPath : null,
  };
}

export function buildAutoBackupFileName(
  config: Pick<AutoBackupConfig, "overwriteExisting" | "repeatUnit">,
  now: Date = new Date(),
): string {
  if (config.overwriteExisting) {
    return `${AUTO_BACKUP_BASE_NAME}.json`;
  }
  const datePart = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  if (config.repeatUnit === "hours") {
    const timePart = `${pad2(now.getHours())}-${pad2(now.getMinutes())}`;
    return `${AUTO_BACKUP_BASE_NAME}-${datePart}_${timePart}.json`;
  }
  return `${AUTO_BACKUP_BASE_NAME}-${datePart}.json`;
}

export function computeNextAutoBackupRunAt(
  config: Pick<AutoBackupConfig, "startTime" | "repeatEvery" | "repeatUnit">,
  fromMs: number = Date.now(),
): number {
  const { hour, minute } = parseStartTime(config.startTime);
  const step = Math.max(1, Math.round(config.repeatEvery || 1));
  const anchor = new Date(fromMs);
  anchor.setHours(hour, minute, 0, 0);

  if (config.repeatUnit === "hours") {
    const intervalMs = step * HOUR_MS;
    let candidate = anchor.getTime();
    while (candidate - intervalMs > fromMs) {
      candidate -= intervalMs;
    }
    while (candidate <= fromMs) {
      candidate += intervalMs;
    }
    return candidate;
  }

  const candidate = new Date(anchor.getTime());
  while (candidate.getTime() <= fromMs) {
    candidate.setDate(candidate.getDate() + step);
  }
  return candidate.getTime();
}

export function isAutoBackupDue(config: AutoBackupConfig, nowMs: number = Date.now()): boolean {
  if (!config.enabled || config.nextRunAt === null) return false;
  return nowMs >= config.nextRunAt;
}

export function resolveScheduledNextRunAt(
  config: AutoBackupConfig,
  nowMs: number = Date.now(),
): number | null {
  if (!config.enabled) return null;
  if (config.nextRunAt !== null) return config.nextRunAt;
  if (config.lastRunAt !== null) {
    return computeNextAutoBackupRunAt(config, config.lastRunAt);
  }
  return computeNextAutoBackupRunAt(config, nowMs);
}

export function isMissedAutoBackupCatchUp(
  nextRunAt: number | null,
  nowMs: number = Date.now(),
  graceMs: number = 2 * 60_000,
): boolean {
  return nextRunAt !== null && nowMs - nextRunAt >= graceMs;
}

export function validateAutoBackupReady(
  config: Pick<AutoBackupConfig, "directoryPath">,
  passwordSaved: boolean,
): string | null {
  if (!config.directoryPath.trim()) {
    return "Select or enter a backup folder first.";
  }
  if (!passwordSaved) {
    return "Set a backup password before enabling Auto Backup.";
  }
  return null;
}
