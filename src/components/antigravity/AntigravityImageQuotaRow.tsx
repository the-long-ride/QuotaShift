import React from "react";
import type { AntigravityModelQuota } from "../../utils/common/types";
import { useQuotaPercentMode } from "../../hooks/desktop/useQuotaPercentMode";
import { quotaPercentDisplay } from "../../utils/common/settings/quota-percent-mode";
import { formatCardResetLabel } from "../../utils/common/ui/reset-label";
import { getUsageTone } from "../../utils/common/accounts/usage-tone";

export const AntigravityImageQuotaRow: React.FC<{ quota: AntigravityModelQuota }> = ({ quota }) => {
  const showUsed = useQuotaPercentMode();
  const displayPercent = quotaPercentDisplay(quota.remainingPercent, showUsed) ?? 0;
  const reset = formatCardResetLabel("antigravity", quota.resetAt, false);
  return (
    <div className="antigravity-quota-group antigravity-quota-group--image">
      <div className="quota-item-header">
        <span className="quota-model-name" title="Image Generation">
          <span className="label-full">Image Generation</span>
          <span className="label-compact model-icon-compact">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
              <path
                d="M4 10V6C4 4.89543 4.89543 4 6 4H12M4.02693 18.329C4.18385 19.277 5.0075 20 6 20H18C19.1046 20 20 19.1046 20 18V14.1901M4.02693 18.329C4.00922 18.222 4 18.1121 4 18V15M4.02693 18.329L7.84762 14.5083C8.52765 13.9133 9.52219 13.8481 10.274 14.3494L10.7832 14.6888C11.5078 15.1719 12.4619 15.1305 13.142 14.5864L15.7901 12.4679C16.4651 11.9279 17.4053 11.8855 18.1228 12.3484C18.2023 12.3997 18.2731 12.4632 18.34 12.5301L20 14.1901M20 14.1901V6C20 4.89543 19.1046 4 18 4H17M11 9C11 10.1046 10.1046 11 9 11C7.89543 11 7 10.1046 7 9C7 7.89543 7.89543 7 9 7C10.1046 7 11 7.89543 11 9Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
      </div>
      <div className="quota-limits-container">
        <div className="quota-limit-col">
          <div className="quota-limit-label-container">
            <span className="quota-limit-name">
              <span className="label-full">Quota</span>
              <span className="label-compact">Images</span>
            </span>
            <span className="quota-limit-reset">{reset}</span>
          </div>
          <div
            className="quota-limit-bar-container"
            data-usage-tone={getUsageTone(quota.remainingPercent)}
            data-tooltip={`Image Generation ${showUsed ? "Used" : "Remaining"} - ${reset}`}
          >
            <div className="progress-container">
              <div className="progress-bar" style={{ width: `${displayPercent}%` }} />
            </div>
            <span className="quota-value">{displayPercent}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
