import React from "react";
import { formatUsageLimitTooltip } from "../../utils/common/format-time";
import { epochToIso, formatCardResetLabel } from "../../utils/common/reset-label";
import { formatCompactLimitLabel } from "../../utils/common/card-layout-mode";
import { getUsageTone } from "../../utils/common/usage-tone";
import { CodexUsageWindow } from "../../utils/codex/codex-usage-windows";
import { CodexSpendBreakdown } from "./CodexSpendBreakdown";

interface CodexCardUsageLimitsProps {
  windows: CodexUsageWindow[];
  snapshot?: { models: any[] };
  isOAuth?: boolean;
}

export const CodexCardUsageLimits: React.FC<CodexCardUsageLimitsProps> = ({
  windows,
  snapshot,
  isOAuth,
}) => {
  if (isOAuth) {
    if (windows.length === 0) {
      return (
        <div style={{ fontSize: "8.5px", color: "var(--text-secondary)" }}>
          No rate-limit windows reported.
        </div>
      );
    }
    return (
      <div
        className="quota-limits-container"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${windows.length}, 1fr)`,
          gap: "8px",
        }}
      >
        {windows.map((item, idx) => {
          const pct = Math.round(Math.max(0, 100 - item.usedPercent));
          const expandedLabel = item.label.replace(/\s+limit$/i, "");
          const resetStr = formatCardResetLabel("codex", epochToIso(item.resetAt));
          return (
            <div key={`${item.kind}-${item.resetAt ?? idx}`} className="quota-limit-col">
              <div className="quota-limit-label-container">
                <span className="quota-limit-name">
                  <span className="label-full">{expandedLabel}</span>
                  <span className="label-compact">{formatCompactLimitLabel(item.label)}</span>
                </span>
                <span className="quota-limit-reset">{resetStr}</span>
              </div>
              <div
                className="quota-limit-bar-container"
                data-usage-tone={getUsageTone(pct)}
                data-tooltip={formatUsageLimitTooltip(expandedLabel, resetStr)}
              >
                <div className="progress-container">
                  <div className="progress-bar progress-bar--codex" style={{ width: `${pct}%` }} />
                </div>
                <span className="quota-value">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  if (snapshot) {
    return <CodexSpendBreakdown snapshot={snapshot} />;
  }
  return null;
};
