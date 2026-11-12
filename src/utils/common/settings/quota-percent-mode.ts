export const QUOTA_PERCENT_MODE_KEY = "quotashift_show_used_quota_v1";
export const QUOTA_PERCENT_MODE_CHANGED_EVENT = "quotashift:quota-percent-mode-changed";
export function loadQuotaPercentMode(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(QUOTA_PERCENT_MODE_KEY) === "true";
}
export function saveQuotaPercentMode(enabled: boolean): void {
  localStorage.setItem(QUOTA_PERCENT_MODE_KEY, String(enabled));
  window.dispatchEvent(new Event(QUOTA_PERCENT_MODE_CHANGED_EVENT));
}
export function quotaPercentDisplay(remaining: number | null | undefined, showUsed: boolean): number | null {
  if (remaining == null || !Number.isFinite(remaining)) return null;
  const clamped = Math.max(0, Math.min(100, remaining));
  return showUsed ? 100 - clamped : clamped;
}
