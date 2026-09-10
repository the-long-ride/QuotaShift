import React from "react";
import type { QuotaData } from "../utils/types";
import { formatAbsoluteTime } from "../utils/format-time";

interface AntigravityQuotaRowsProps {
  quotas?: QuotaData[] | null;
}

export const AntigravityQuotaRows: React.FC<AntigravityQuotaRowsProps> = ({ quotas }) => {
  if (!quotas?.length) return null;
  return (
    <div className="codex-card-limits" style={{ marginTop: "10px" }}>
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
            style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}
          >
            <div
              className="quota-item-header"
              style={{ padding: 0, border: "none", marginBottom: "2px" }}
            >
              <span className="quota-model-name" style={{ fontSize: "9px", fontWeight: 600 }}>
                {quota.model}
              </span>
            </div>
            <div
              className="quota-limits-container"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}
            >
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
                    <span className="quota-limit-name">{lane.label}</span>
                    <span className="quota-limit-reset">
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
