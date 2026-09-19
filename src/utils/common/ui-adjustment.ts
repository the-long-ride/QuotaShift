export type OverlayTheme = "glassmorphism" | "mono";

export interface UiAdjustmentPreferences {
  overlayScale: number;
  overlayTheme: OverlayTheme;
}

export const UI_ADJUSTMENT_STORAGE_KEY = "quotashift_ui_adjustment_v1";
export const UI_ADJUSTMENT_EVENT = "ui-adjustment-changed";
export const OVERLAY_BASE_WIDTH = 340;
export const OVERLAY_BASE_WIDTH_ANTIGRAVITY = 340;
export const OVERLAY_BASE_WIDTH_COMPACT = 220;
export const OVERLAY_BASE_HEIGHT = 80;
export const OVERLAY_BASE_HEIGHT_ANTIGRAVITY = 80;
export const OVERLAY_BASE_HEIGHT_COMPACT = 68;

export const UI_ADJUSTMENT_DEFAULTS: UiAdjustmentPreferences = {
  overlayScale: 100,
  overlayTheme: "glassmorphism",
};

export const UI_ADJUSTMENT_LIMITS = {
  overlayScale: { min: 80, max: 200 },
} as const;

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
};

const normalizeOverlayTheme = (value: unknown): OverlayTheme =>
  value === "mono" || value === "black-white" ? "mono" : "glassmorphism";

export const normalizeUiAdjustmentPreferences = (
  input: Partial<UiAdjustmentPreferences> | Record<string, unknown> | null | undefined,
): UiAdjustmentPreferences => ({
  overlayScale: clamp(
    input?.overlayScale,
    UI_ADJUSTMENT_LIMITS.overlayScale.min,
    UI_ADJUSTMENT_LIMITS.overlayScale.max,
    UI_ADJUSTMENT_DEFAULTS.overlayScale,
  ),
  overlayTheme: normalizeOverlayTheme(input?.overlayTheme),
});

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const loadUiAdjustmentPreferences = (
  storage: StorageLike | null = typeof localStorage !== "undefined" ? localStorage : null,
): UiAdjustmentPreferences => {
  if (!storage) return normalizeUiAdjustmentPreferences(null);
  try {
    const raw = storage.getItem(UI_ADJUSTMENT_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    return normalizeUiAdjustmentPreferences(parsed);
  } catch {
    return normalizeUiAdjustmentPreferences(null);
  }
};

export const saveUiAdjustmentPreferences = (
  preferences: UiAdjustmentPreferences,
  storage: StorageLike | null = typeof localStorage !== "undefined" ? localStorage : null,
): void => {
  if (!storage) return;
  storage.setItem(
    UI_ADJUSTMENT_STORAGE_KEY,
    JSON.stringify(normalizeUiAdjustmentPreferences(preferences)),
  );
};

export const getOverlayBaseWidth = (provider?: string | null): number => {
  if (provider === "codex" || provider === "claude") {
    return OVERLAY_BASE_WIDTH_COMPACT;
  }
  return OVERLAY_BASE_WIDTH_ANTIGRAVITY;
};

export const getOverlayWindowWidth = (
  preferences: UiAdjustmentPreferences,
  provider?: string | null,
): number => {
  const baseWidth = getOverlayBaseWidth(provider);
  return Math.round((baseWidth * preferences.overlayScale) / 100);
};

export const getOverlayBaseHeight = (provider?: string | null): number => {
  if (provider === "codex" || provider === "claude") {
    return OVERLAY_BASE_HEIGHT_COMPACT;
  }
  return OVERLAY_BASE_HEIGHT_ANTIGRAVITY;
};

export const getOverlayWindowHeight = (
  preferences: UiAdjustmentPreferences,
  provider?: string | null,
): number => {
  const baseHeight = getOverlayBaseHeight(provider);
  return Math.round((baseHeight * preferences.overlayScale) / 100);
};
