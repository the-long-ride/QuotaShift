import React from "react";
import type { ClaudeRateLimitWindow } from "../../utils/common/types";
import { useQuotaPercentMode } from "../../hooks/desktop/useQuotaPercentMode";
import { quotaPercentDisplay } from "../../utils/common/settings/quota-percent-mode";
import { clampPercent, formatPercent } from "../../utils/claude/claude-formatters";
import { formatUsageLimitTooltip } from "../../utils/common/ui/format-time";
import { epochToIso, formatCardResetLabel } from "../../utils/common/ui/reset-label";
import { getUsageTone } from "../../utils/common/accounts/usage-tone";

export const AccountUsageMeter: React.FC<{
  fullLabel: string;
  compactLabel: string;
  tooltipLabel: string;
  window: ClaudeRateLimitWindow | null;
}> = ({ fullLabel, compactLabel, tooltipLabel, window }) => {
  const showUsed = useQuotaPercentMode();
  const used = window?.usedPercentage;
  const remaining = used == null ? null : 100 - clampPercent(used);
  const displayPercent = quotaPercentDisplay(remaining, showUsed);
  const resetLabel = formatCardResetLabel("claude", epochToIso(window?.resetsAt));
  const tooltip = resetLabel
    ? formatUsageLimitTooltip(tooltipLabel, resetLabel)
    : `${tooltipLabel} usage limit`;
  return (
    <div className="quota-limit-col claude-quota-col">
      <div className="quota-limit-label-container">
        <span className="quota-limit-name">
          <span className="label-full">{fullLabel}</span>
          <span className="label-compact">{compactLabel}</span>
        </span>
        {resetLabel && <span className="quota-limit-reset">{resetLabel}</span>}
      </div>
      <div
        className="quota-limit-bar-container"
        data-usage-tone={getUsageTone(remaining)}
        data-tooltip={`${showUsed ? "Used" : "Remaining"} - ${tooltip}`}
        aria-label={tooltip}
      >
        <div className="progress-container">
          <div className="progress-bar" style={{ width: `${displayPercent ?? 0}%` }} />
        </div>
        <span className="quota-value">
          {displayPercent == null ? "--" : formatPercent(displayPercent)}
        </span>
      </div>
    </div>
  );
};
