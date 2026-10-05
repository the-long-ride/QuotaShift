/** Overlay tracking: one ordered list of up to 3 accounts from any provider (multi-track on). */
import { OVERLAY_TRACKED_ACCOUNT_ID_KEY, OVERLAY_TRACKED_PROVIDER_KEY } from "./app-constants.js";

export type TrackedProvider = "antigravity" | "codex" | "claude";
export type TrackedIds = Record<TrackedProvider, string[]>;
export interface TrackedEntry {
  provider: TrackedProvider;
  id: string;
}
export type ToggleResult = "added" | "removed" | "replaced" | "max" | "min";

export const MAX_TRACKED = 3;
export const TRACKED_LIST_KEY = "quotashift_overlay_tracked_v2";
export const LEGACY_TRACKED_IDS_KEY = "quotashift_overlay_tracked_ids_v1";
export const MULTI_TRACK_KEY = "quotashift_multi_track_v2";
export const LEGACY_MULTI_TRACK_KEY = "quotashift_multi_track_v1";
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

export const sameEntry = (a: TrackedEntry, b: TrackedEntry): boolean =>
  a.provider === b.provider && a.id === b.id;

function readRaw(storage: Reader | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function readJson(storage: Reader | null, key: string): unknown {
  try {
    const raw = readRaw(storage, key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cleanList(value: unknown): TrackedEntry[] {
  if (!Array.isArray(value)) return [];
  const list: TrackedEntry[] = [];
  for (const item of value) {
    if (list.length >= MAX_TRACKED) break;
    if (!item || typeof item !== "object") continue;
    const { provider, id } = item as Record<string, unknown>;
    if (!isTrackedProvider(provider) || typeof id !== "string" || !id.trim()) continue;
    const entry = { provider, id };
    if (!list.some((existing) => sameEntry(existing, entry))) list.push(entry);
  }
  return list;
}

/** v1 kept ids per provider and only showed the tracked provider's list (or one legacy id). */
function migrateLegacyList(storage: Reader | null): TrackedEntry[] {
  const provider = readRaw(storage, OVERLAY_TRACKED_PROVIDER_KEY);
  if (!isTrackedProvider(provider)) return [];
  const legacy = readJson(storage, LEGACY_TRACKED_IDS_KEY) as Record<string, unknown> | null;
  const ids = legacy && Array.isArray(legacy[provider]) ? (legacy[provider] as unknown[]) : [];
  const list = cleanList(ids.map((id) => ({ provider, id })));
  if (list.length) return list;
  const id = readRaw(storage, OVERLAY_TRACKED_ACCOUNT_ID_KEY);
  return id ? [{ provider, id }] : [];
}

export function loadTrackedList(storage: Reader | null = defaultStorage()): TrackedEntry[] {
  const parsed = readJson(storage, TRACKED_LIST_KEY);
  return Array.isArray(parsed) ? cleanList(parsed) : migrateLegacyList(storage);
}

export function saveTrackedList(
  list: TrackedEntry[],
  storage: Writer | null = defaultStorage(),
): void {
  try {
    storage?.setItem(TRACKED_LIST_KEY, JSON.stringify(cleanList(list)));
  } catch {
    // Storage blocked; state stays in memory for this session.
  }
}

/** Per-provider view of the list, for pollers that only care about one provider. */
export function trackedIdsByProvider(list: TrackedEntry[]): TrackedIds {
  const ids = emptyTrackedIds();
  for (const entry of list) ids[entry.provider].push(entry.id);
  return ids;
}

export function loadTrackedIds(storage: Reader | null = defaultStorage()): TrackedIds {
  return trackedIdsByProvider(loadTrackedList(storage));
}

/** Experimental multi-track switch; migrates the v1 per-provider switches (any on → on). */
export function loadMultiTrackEnabled(storage: Reader | null = defaultStorage()): boolean {
  const saved = readJson(storage, MULTI_TRACK_KEY);
  if (typeof saved === "boolean") return saved;
  const legacy = readJson(storage, LEGACY_MULTI_TRACK_KEY) as Record<string, unknown> | null;
  return PROVIDERS.some((provider) => legacy?.[provider] === true);
}

export function saveMultiTrackEnabled(
  enabled: boolean,
  storage: Writer | null = defaultStorage(),
): void {
  try {
    storage?.setItem(MULTI_TRACK_KEY, JSON.stringify(enabled));
  } catch {
    // Storage blocked; toggle applies only for this session.
  }
}

/** Double-click on an account card: replace (single mode) or add/remove (multi mode, 1–3). */
export function toggleTrackedEntry(
  list: TrackedEntry[],
  entry: TrackedEntry,
  multi: boolean,
): { list: TrackedEntry[]; result: ToggleResult } {
  if (!multi) return { list: [entry], result: "replaced" };
  if (list.some((existing) => sameEntry(existing, entry))) {
    if (list.length <= 1) return { list, result: "min" };
    return { list: list.filter((existing) => !sameEntry(existing, entry)), result: "removed" };
  }
  if (list.length >= MAX_TRACKED) return { list, result: "max" };
  return { list: [...list, entry], result: "added" };
}

/** Keeps the list consistent when another flow (e.g. an account switch) picks the primary. */
export function ensurePrimaryEntry(
  list: TrackedEntry[],
  entry: TrackedEntry,
  multi: boolean,
): TrackedEntry[] {
  if (list.some((existing) => sameEntry(existing, entry))) return list;
  return multi && list.length ? [entry, ...list.slice(1)] : [entry];
}

/** Turning multi-track off keeps only the primary account (or the first one). */
export function trimTrackedList(
  list: TrackedEntry[],
  primary: TrackedEntry | null,
): TrackedEntry[] {
  if (list.length <= 1) return list;
  const keep = primary ? list.find((existing) => sameEntry(existing, primary)) : undefined;
  return [keep ?? list[0]];
}

export function readPrimaryEntry(storage: Reader | null = defaultStorage()): TrackedEntry | null {
  const provider = readRaw(storage, OVERLAY_TRACKED_PROVIDER_KEY);
  const id = readRaw(storage, OVERLAY_TRACKED_ACCOUNT_ID_KEY);
  return isTrackedProvider(provider) && id ? { provider, id } : null;
}
