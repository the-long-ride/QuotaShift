import {
  MAX_TRACKED,
  loadMultiTrackEnabled,
  loadTrackedList,
  saveTrackedList,
  TRACKED_IDS_CHANGED_EVENT,
  type TrackedProvider,
} from "../accounts/tracked-accounts.js";
import {
  OVERLAY_TRACKED_ACCOUNT_ID_KEY,
  OVERLAY_TRACKED_PROVIDER_KEY,
} from "../backup/app-constants.js";

const KEY = "quotashift_auto_monitor_on_apply_v1";

export const loadAutoMonitorOnApply = (): boolean =>
  typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "true";

export const saveAutoMonitorOnApply = (enabled: boolean): void => {
  localStorage.setItem(KEY, String(enabled));
};

export function promoteAppliedAccountToMonitor(provider: TrackedProvider, id: string): void {
  const entry = { provider, id };
  const previous = loadTrackedList();
  const others = previous.filter((item) => item.provider !== provider || item.id !== id);
  const next = loadMultiTrackEnabled() ? [entry, ...others].slice(0, MAX_TRACKED) : [entry];
  saveTrackedList(next);
  localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, provider);
  localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, id);
  window.dispatchEvent(new CustomEvent(TRACKED_IDS_CHANGED_EVENT));
}
