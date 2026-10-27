export const MAIN_WINDOW_ZOOM_STORAGE_KEY = "quotashift_main_webview_zoom_v1";
export const MAIN_WINDOW_ZOOM_MIN = 70;
export const MAIN_WINDOW_ZOOM_MAX = 190;
export const MAIN_WINDOW_ZOOM_STEP = 10;
export const MAIN_WINDOW_ZOOM_DEFAULT = 100;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const normalizeMainWindowZoomPercent = (value: unknown): number => {
  if (value === null || value === undefined || value === "") return MAIN_WINDOW_ZOOM_DEFAULT;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return MAIN_WINDOW_ZOOM_DEFAULT;
  return Math.max(MAIN_WINDOW_ZOOM_MIN, Math.min(MAIN_WINDOW_ZOOM_MAX, Math.round(parsed)));
};

export const loadMainWindowZoomPercent = (
  storage: StorageLike | null = typeof localStorage !== "undefined" ? localStorage : null,
): number => {
  if (!storage) return MAIN_WINDOW_ZOOM_DEFAULT;
  return normalizeMainWindowZoomPercent(storage.getItem(MAIN_WINDOW_ZOOM_STORAGE_KEY));
};

export const saveMainWindowZoomPercent = (
  percent: number,
  storage: StorageLike | null = typeof localStorage !== "undefined" ? localStorage : null,
): void => {
  if (!storage) return;
  storage.setItem(MAIN_WINDOW_ZOOM_STORAGE_KEY, String(normalizeMainWindowZoomPercent(percent)));
};

export const nextMainWindowZoomPercent = (current: number, delta: -1 | 0 | 1): number =>
  delta === 0
    ? MAIN_WINDOW_ZOOM_DEFAULT
    : normalizeMainWindowZoomPercent(current + delta * MAIN_WINDOW_ZOOM_STEP);
