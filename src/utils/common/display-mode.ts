import { OVERLAY_ENABLED_KEY } from "./app-constants.js";

export type DisplayMode = "none" | "overlay" | "taskbar";
export const DISPLAY_MODES: readonly DisplayMode[] = ["none", "overlay", "taskbar"];
export const DISPLAY_MODE_KEY = "quotashift_display_mode_v1";
export const DISPLAY_MODE_LAST_KEY = "quotashift_display_mode_last_v1";
export const DISPLAY_MODE_EVENT = "display-mode-changed";

type ModeStorage = Pick<Storage, "getItem" | "setItem">;

const defaultStorage = (): ModeStorage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export const isDisplayMode = (value: unknown): value is DisplayMode =>
  typeof value === "string" && (DISPLAY_MODES as readonly string[]).includes(value);

const read = (storage: ModeStorage | null, key: string): string | null => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

/** Saved mode; migrates the legacy overlay on/off flag (`"false"` → none, else overlay). */
export function loadDisplayMode(storage: ModeStorage | null = defaultStorage()): DisplayMode {
  const saved = read(storage, DISPLAY_MODE_KEY);
  if (isDisplayMode(saved)) return saved;
  return read(storage, OVERLAY_ENABLED_KEY) === "false" ? "none" : "overlay";
}

/** Persists the mode, remembers the last visible one, and keeps the legacy flag in sync. */
export function saveDisplayMode(
  mode: DisplayMode,
  storage: ModeStorage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(DISPLAY_MODE_KEY, mode);
    storage?.setItem(OVERLAY_ENABLED_KEY, String(mode !== "none"));
    if (mode !== "none") storage?.setItem(DISPLAY_MODE_LAST_KEY, mode);
  } catch {}
}

/** Quick toggle (shortcut / header button): None → Overlay → Taskbar (Windows only) → None. */
export function nextQuickToggleMode(
  current: DisplayMode,
  platform: string = currentPlatform(),
): DisplayMode {
  if (current === "none") return "overlay";
  if (current === "overlay" && isTaskbarSupported(platform)) return "taskbar";
  return "none";
}

/** The taskbar strip is Windows-only for now. Note: "Darwin" contains "win", so match words. */
export function isTaskbarSupported(platform: string): boolean {
  return /\b(windows|win32|win64)\b/i.test(platform);
}

export function effectiveDisplayMode(mode: DisplayMode, platform: string): DisplayMode {
  return mode === "taskbar" && !isTaskbarSupported(platform) ? "overlay" : mode;
}

export function currentPlatform(): string {
  try {
    return typeof navigator === "undefined" ? "" : navigator.userAgent || "";
  } catch {
    return "";
  }
}
