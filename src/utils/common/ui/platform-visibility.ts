export type PlatformId = "antigravity" | "codex" | "claude";

export interface PlatformVisibility {
  antigravity: boolean;
  codex: boolean;
  claude: boolean;
}

export const PLATFORM_VISIBILITY_KEY = "quotashift_platform_visibility_v1";

export const DEFAULT_PLATFORM_VISIBILITY: PlatformVisibility = {
  antigravity: true,
  codex: true,
  claude: true,
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function normalizePlatformVisibility(value: unknown): PlatformVisibility {
  if (!value || typeof value !== "object") return { ...DEFAULT_PLATFORM_VISIBILITY };
  const input = value as Partial<Record<PlatformId, unknown>>;
  return {
    antigravity:
      typeof input.antigravity === "boolean"
        ? input.antigravity
        : DEFAULT_PLATFORM_VISIBILITY.antigravity,
    codex: typeof input.codex === "boolean" ? input.codex : DEFAULT_PLATFORM_VISIBILITY.codex,
    claude: typeof input.claude === "boolean" ? input.claude : DEFAULT_PLATFORM_VISIBILITY.claude,
  };
}

export function loadPlatformVisibilityPreference(
  storage: StorageReader = localStorage,
): PlatformVisibility {
  try {
    const raw = storage.getItem(PLATFORM_VISIBILITY_KEY);
    return raw ? normalizePlatformVisibility(JSON.parse(raw)) : { ...DEFAULT_PLATFORM_VISIBILITY };
  } catch {
    return { ...DEFAULT_PLATFORM_VISIBILITY };
  }
}

export function savePlatformVisibilityPreference(
  value: PlatformVisibility,
  storage: StorageWriter = localStorage,
): void {
  try {
    storage.setItem(PLATFORM_VISIBILITY_KEY, JSON.stringify(normalizePlatformVisibility(value)));
  } catch {}
}

export function firstVisiblePlatform(value: PlatformVisibility): PlatformId | null {
  if (value.antigravity) return "antigravity";
  if (value.codex) return "codex";
  if (value.claude) return "claude";
  return null;
}
