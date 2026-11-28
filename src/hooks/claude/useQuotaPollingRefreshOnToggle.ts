import { useEffect } from "react";
import { QUOTA_POLLING_CHANGED_EVENT } from "../../utils/common/accounts/quota-polling";

export function useQuotaPollingRefreshOnToggle(
  platformVisible: boolean,
  requestStatuses: () => Promise<unknown>,
): void {
  useEffect(() => {
    if (!platformVisible) return;
    const onToggle = () => {
      void requestStatuses().catch(() => {});
    };
    window.addEventListener(QUOTA_POLLING_CHANGED_EVENT, onToggle);
    return () => window.removeEventListener(QUOTA_POLLING_CHANGED_EVENT, onToggle);
  }, [platformVisible, requestStatuses]);
}
