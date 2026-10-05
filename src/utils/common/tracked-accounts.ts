/** Overlay tracking: which accounts per provider are shown (1–3 when multi-track is on). */
import { OVERLAY_TRACKED_ACCOUNT_ID_KEY, OVERLAY_TRACKED_PROVIDER_KEY } from "./app-constants.js";

export type TrackedProvider = "antigravity" | "codex" | "claude";
export type TrackedIds = Record<TrackedProvider, string[]>;
export type MultiTrack = Record<TrackedProvider, boolean>;
export type ToggleResult = "added" | "removed" | "replaced" | "max" | "min" | "switched";

export const MAX_TRACKED = 3;
export const TRACKED_IDS_KEY = "quotashift_overlay_tracked_ids_v1";
export const MULTI_TRACK_KEY = "quotashift_multi_track_v1";
export const TRACKED_IDS_CHANGED_EVENT = "quotashift:tracked-ids-changed";

const PROVIDERS: TrackedProvider[] = ["antigravity", "codex", "claude"];

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;
const defaultStorage = (): (Reader & Writer) | null =>
  typeof localStorage !== "undefined" ? localStorage : null;

export const emptyTrackedIds = (): TrackedIds => ({ antigravity: [], codex: [], claude: [] });

export function isTrackedProvider(value: unknown): value is TrackedProvider {
  return typeof value === "string" && (PROVIDERS as string[]).includes(value);
}

function readJson(storage: Reader | null, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  return [...new Set(ids)].slice(0, MAX_TRACKED);
}

export function loadTrackedIds(storage: Reader | null = defaultStorage()): TrackedIds {
  const parsed = readJson(storage, TRACKED_IDS_KEY);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    return {
      antigravity: cleanIds(record.antigravity),
      codex: cleanIds(record.codex),
      claude: cleanIds(record.claude),
    };
  }
  const ids = emptyTrackedIds();
  if (!storage) return ids;
  try {
    const provider = storage.getItem(OVERLAY_TRACKED_PROVIDER_KEY);
    const id = storage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY);
    if (isTrackedProvider(provider) && id) ids[provider] = [id];
  } catch {
    // Blocked storage: start with nothing tracked.
  }
  return ids;
}

export function saveTrackedIds(ids: TrackedIds, storage: Writer | null = defaultStorage()): void {
  try {
    storage?.setItem(TRACKED_IDS_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked; state stays in memory for this session.
  }
}

export function loadMultiTrack(storage: Reader | null = defaultStorage()): MultiTrack {
  const parsed = readJson(storage, MULTI_TRACK_KEY) as Record<string, unknown> | null;
  return {
    antigravity: parsed?.antigravity === true,
    codex: parsed?.codex === true,
    claude: parsed?.claude === true,
  };
}

export function saveMultiTrack(value: MultiTrack, storage: Writer | null = defaultStorage()): void {
  try {
    storage?.setItem(MULTI_TRACK_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked; toggle applies only for this session.
  }
}

export function toggleTrackedAccount(
  ids: TrackedIds,
  shown: TrackedProvider,
  provider: TrackedProvider,
  id: string,
  multi: boolean,
): { ids: TrackedIds; shown: TrackedProvider; result: ToggleResult } {
  const current = ids[provider];
  if (provider !== shown) {
    const next = !multi || current.length === 0 ? [id] : current;
    const list = multi && !next.includes(id) && next.length < MAX_TRACKED ? [...next, id] : next;
    return { ids: { ...ids, [provider]: list }, shown: provider, result: "switched" };
  }
  if (!multi) return { ids: { ...ids, [provider]: [id] }, shown, result: "replaced" };
  if (current.includes(id)) {
    if (current.length <= 1) return { ids, shown, result: "min" };
    return {
      ids: { ...ids, [provider]: current.filter((x) => x !== id) },
      shown,
      result: "removed",
    };
  }
  if (current.length >= MAX_TRACKED) return { ids, shown, result: "max" };
  return { ids: { ...ids, [provider]: [...current, id] }, shown, result: "added" };
}

export function trimToSingle(ids: TrackedIds, provider: TrackedProvider): TrackedIds {
  return ids[provider].length <= 1 ? ids : { ...ids, [provider]: ids[provider].slice(0, 1) };
}

export function pruneTracked(
  ids: TrackedIds,
  provider: TrackedProvider,
  existing: string[],
): TrackedIds {
  const keep = ids[provider].filter((id) => existing.includes(id));
  return keep.length === ids[provider].length ? ids : { ...ids, [provider]: keep };
}

export function isAccountTracked(
  ids: TrackedIds,
  shown: TrackedProvider,
  provider: TrackedProvider,
  id: string,
): boolean {
  return shown === provider && ids[provider].includes(id);
}
