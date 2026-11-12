import { useSyncExternalStore } from "react";
import { QUOTA_PERCENT_MODE_CHANGED_EVENT, QUOTA_PERCENT_MODE_KEY, loadQuotaPercentMode } from "../../utils/common/settings/quota-percent-mode";

function subscribe(callback: () => void): () => void {
  window.addEventListener(QUOTA_PERCENT_MODE_CHANGED_EVENT, callback);
  const onStorage = (event: StorageEvent) => { if (event.key === QUOTA_PERCENT_MODE_KEY) callback(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", callback);
  return () => {
    window.removeEventListener(QUOTA_PERCENT_MODE_CHANGED_EVENT, callback);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", callback);
  };
}
export function useQuotaPercentMode(): boolean {
  return useSyncExternalStore(subscribe, loadQuotaPercentMode, () => false);
}
