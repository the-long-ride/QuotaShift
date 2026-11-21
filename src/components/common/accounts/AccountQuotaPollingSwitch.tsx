import React, { useSyncExternalStore } from "react";
import { CommonSwitch } from "../CommonSwitch";
import type { TrackedProvider } from "../../../utils/common/accounts/tracked-accounts";
import { TRACKED_IDS_CHANGED_EVENT } from "../../../utils/common/accounts/tracked-accounts";
import {
  isQuotaPollingEnabled,
  QUOTA_POLLING_CHANGED_EVENT,
  QUOTA_POLLING_DISABLED_KEY,
  setQuotaPollingEnabled,
} from "../../../utils/common/accounts/quota-polling";

export const AccountQuotaPollingSwitch: React.FC<{
  provider: TrackedProvider;
  accountId: string;
  required?: boolean;
}> = ({ provider, accountId, required = false }) => {
  const enabled = useSyncExternalStore(
    (notify) => {
      window.addEventListener(QUOTA_POLLING_CHANGED_EVENT, notify);
      window.addEventListener(TRACKED_IDS_CHANGED_EVENT, notify);
      const onStorage = (event: StorageEvent) => {
        if (event.key === QUOTA_POLLING_DISABLED_KEY) notify();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(QUOTA_POLLING_CHANGED_EVENT, notify);
        window.removeEventListener(TRACKED_IDS_CHANGED_EVENT, notify);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => required || isQuotaPollingEnabled(provider, accountId),
    () => true,
  );
  return (
    <CommonSwitch
      checked={enabled}
      disabled={required}
      ariaLabel={`Automatic quota polling for ${provider} account ${accountId}`}
      className="account-quota-polling-switch"
      tooltip={
        required
          ? "Quota polling is required by monitoring or Claude guardrails"
          : enabled
            ? "Automatic quota polling on · click to disable (manual refresh and keep-alive remain available)"
            : "Automatic quota polling off · click to enable"
      }
      onToggle={() => setQuotaPollingEnabled(provider, accountId, !enabled)}
    />
  );
};
