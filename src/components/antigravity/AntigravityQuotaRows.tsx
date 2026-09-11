import React from "react";
import type { QuotaData } from "../../utils/common/types";
import { formatAbsoluteTime } from "../../utils/common/format-time";
import { formatCompactLimitLabel } from "../../utils/common/card-layout-mode";
import { ModelPoolIcon } from "../common/ModelLogos";

interface AntigravityQuotaRowsProps {
  quotas?: QuotaData[] | null;
}

export const AntigravityQuotaRows: React.FC<AntigravityQuotaRowsProps> = ({ quotas }) => {
  if (!quotas?.length) return null;
  return (
    <div className="codex-card-limits antigravity-quota-list">
      {quotas.map((quota, index) => {
        const fiveKnown = quota.fiveHourPercent !== undefined && quota.fiveHourPercent !== null;
        const weeklyKnown = quota.weeklyPercent !== undefined && quota.weeklyPercent !== null;
        const fiveReset = quota.fiveHourDisabled
          ? "Disabled"
          : quota.fiveHourReset
            ? formatAbsoluteTime(quota.fiveHourReset)
            : "Ready";
        const weeklyReset = quota.weeklyDisabled
          ? "Disabled"
          : quota.weeklyReset
            ? formatAbsoluteTime(quota.weeklyReset)
            : "Ready";
        return (
          <div
            key={`${quota.model}-${index}`}
            className="antigravity-quota-group"
          >
            <div className="quota-item-header">
              <span className="quota-model-name" title={quota.model}>
                <span className="label-full">{quota.model}</span>
                <span className="label-compact model-icon-compact">
                  <ModelPoolIcon model={quota.model} />
                </span>
              </span>
            </div>
            <div className="quota-limits-container">
              {[
                {
                  label: "5 hrs limit",
                  known: fiveKnown,
                  percent: quota.fiveHourPercent,
                  reset: fiveReset,
                },
                {
                  label: "Weekly limit",
                  known: weeklyKnown,
                  percent: quota.weeklyPercent,
                  reset: weeklyReset,
                },
              ].map((lane) => (
                <div className="quota-limit-col" key={lane.label}>
                  <div className="quota-limit-label-container">
                    <span className="quota-limit-name" title={lane.label}>
                      <span className="label-full">{lane.label}</span>
                      <span className="label-compact">{formatCompactLimitLabel(lane.label)}</span>
                    </span>
                    <span
                      className="quota-limit-reset"
                      title={lane.known ? lane.reset : "Unavailable"}
                    >
                      {lane.known ? lane.reset : "Unavailable"}
                    </span>
                  </div>
                  <div className="quota-limit-bar-container">
                    {lane.known ? (
                      <>
                        <div className="progress-container">
                          <div className="progress-bar" style={{ width: `${lane.percent}%` }} />
                        </div>
                        <span className="quota-value">{lane.percent}%</span>
                      </>
                    ) : (
                      <span
                        className="quota-value"
                        style={{ width: "100%", textAlign: "left", color: "var(--text-secondary)" }}
                      >
                        Not available
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
