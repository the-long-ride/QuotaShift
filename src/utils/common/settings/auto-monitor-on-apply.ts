import {
  MAX_TRACKED,
  TRACKED_IDS_CHANGED_EVENT,
  loadMultiTrackEnabled,
  loadTrackedList,
  readPrimaryEntry,
  saveMultiTrackEnabled,
  saveTrackedList,
  sameEntry,
  toggleTrackedEntry,
  type ToggleResult,
  type TrackedEntry,
  type TrackedProvider,
} from "../accounts/tracked-accounts.js";
import {
  OVERLAY_TRACKED_ACCOUNT_ID_KEY,
  OVERLAY_TRACKED_PROVIDER_KEY,
} from "../backup/app-constants.js";

export const AUTO_MONITOR_ON_APPLY_KEY = "quotashift_auto_monitor_on_apply_v1";
export const UNMONITOR_SAME_PROVIDER_ON_APPLY_KEY =
  "quotashift_unmonitor_same_provider_on_apply_v1";

export const loadAutoMonitorOnApply = (): boolean =>
  typeof localStorage !== "undefined" && localStorage.getItem(AUTO_MONITOR_ON_APPLY_KEY) === "true";
export const loadUnmonitorSameProviderOnApply = (): boolean =>
  typeof localStorage !== "undefined" &&
  localStorage.getItem(UNMONITOR_SAME_PROVIDER_ON_APPLY_KEY) === "true";

export function saveAutoMonitorOnApply(enabled: boolean): void {
  localStorage.setItem(AUTO_MONITOR_ON_APPLY_KEY, String(enabled));
  // Add-only monitoring cannot work with single-track replacement semantics.
  if (enabled && !loadMultiTrackEnabled()) {
    saveMultiTrackEnabled(true);
    window.dispatchEvent(new CustomEvent(TRACKED_IDS_CHANGED_EVENT));
  }
}
export const saveUnmonitorSameProviderOnApply = (enabled: boolean): void => {
  localStorage.setItem(UNMONITOR_SAME_PROVIDER_ON_APPLY_KEY, String(enabled));
};

export type PromoteAppliedResult = "added" | "already" | "full";
export function appendAppliedAccount(
  existing: TrackedEntry[],
  target: TrackedEntry,
  removeSameProvider: boolean,
): { list: TrackedEntry[]; result: PromoteAppliedResult } {
  const remaining = removeSameProvider
    ? existing.filter((item) => item.provider !== target.provider || sameEntry(item, target))
    : existing;
  if (remaining.some((item) => sameEntry(item, target))) {
    return { list: remaining, result: "already" };
  }
  if (remaining.length >= MAX_TRACKED) {
    return { list: existing, result: "full" };
  }
  return { list: [...remaining, target], result: "added" };
}

/** Toggles/adds a tracked entry while optionally removing other entries from the same provider. */
export function applyTrackEntry(
  existing: TrackedEntry[],
  target: TrackedEntry,
  multi: boolean,
  removeSameProvider: boolean,
): { list: TrackedEntry[]; result: ToggleResult } {
  if (existing.some((item) => sameEntry(item, target))) {
    return toggleTrackedEntry(existing, target, multi);
  }
  if (!multi || !removeSameProvider) {
    return toggleTrackedEntry(existing, target, multi);
  }
  const base = existing.filter((item) => item.provider !== target.provider);
  return { list: [...base, target], result: "added" };
}

function syncPrimaryOverlayKeys(list: TrackedEntry[]): void {
  const primary = readPrimaryEntry();
  if (!list.length) {
    localStorage.removeItem(OVERLAY_TRACKED_PROVIDER_KEY);
    localStorage.removeItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY);
    return;
  }
  if (!primary || !list.some((item) => sameEntry(item, primary))) {
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, list[0].provider);
    localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, list[0].id);
  }
}

function commitIfChanged(previous: TrackedEntry[], next: TrackedEntry[]): boolean {
  if (next.length === previous.length && next.every((item, i) => sameEntry(item, previous[i]))) {
    return false;
  }
  saveTrackedList(next);
  syncPrimaryOverlayKeys(next);
  window.dispatchEvent(new CustomEvent(TRACKED_IDS_CHANGED_EVENT));
  return true;
}

/** Removes any monitored accounts from `provider` except `targetId`. */
export function unmonitorOtherSameProviderAccounts(
  provider: TrackedProvider,
  targetId: string,
): boolean {
  const previous = loadTrackedList();
  const next = previous.filter((item) => item.provider !== provider || item.id === targetId);
  return commitIfChanged(previous, next);
}

/** Never evicts other monitored accounts at capacity unless the user explicitly opts in. */
export function promoteAppliedAccountToMonitor(
  provider: TrackedProvider,
  id: string,
): PromoteAppliedResult {
  if (!loadMultiTrackEnabled()) saveMultiTrackEnabled(true);
  const target = { provider, id };
  const previous = loadTrackedList();
  const { list, result } = appendAppliedAccount(
    previous,
    target,
    loadUnmonitorSameProviderOnApply(),
  );
  if (result === "full") return result;
  commitIfChanged(previous, list);
  return result;
}
