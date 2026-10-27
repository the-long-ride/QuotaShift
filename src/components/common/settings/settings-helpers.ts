export const TRACKED_MIN = 30;
export const TRACKED_MAX = 120;
export const IDLE_MIN = 300;
export const IDLE_MAX = 900;
export const CHANGELOG_URL = "https://github.com/the-long-ride/QuotaShift/blob/main/CHANGELOG.md";

export const idleSecsToMinSec = (s: number) => ({ minutes: Math.floor(s / 60), seconds: s % 60 });
export const minSecToSecs = (m: number, s: number) => m * 60 + s;

export type WarningLevel = "low" | "high" | null;

export const getTrackedWarning = (val: number): WarningLevel =>
  val < TRACKED_MIN ? "low" : val > TRACKED_MAX ? "high" : null;

export const getIdleWarning = (totalSecs: number): WarningLevel =>
  totalSecs < IDLE_MIN ? "low" : totalSecs > IDLE_MAX ? "high" : null;
