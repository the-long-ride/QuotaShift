import { isGeminiOnlyPool } from "../../utils/antigravity/antigravity-quota";
import React from "react";
import type { QuotaData } from "../../utils/common/types";
import { formatUsageLimitTooltip } from "../../utils/common/format-time";
import { formatCardResetLabel } from "../../utils/common/reset-label";
import { formatCompactLimitLabel } from "../../utils/common/card-layout-mode";
import { getUsageTone } from "../../utils/common/usage-tone";
import { ModelPoolIcon } from "../common/ModelLogos";

interface AntigravityQuotaRowsProps {
  quotas?: QuotaData[] | null;
}

export const AntigravityQuotaRows: React.FC<AntigravityQuotaRowsProps> = ({ quotas }) => {
  const validQuotas = (quotas || []).filter((q): q is QuotaData =>
    Boolean(q && typeof q === "object"),
  );
  const geminiOnly = isGeminiOnlyPool(validQuotas.map((q) => q.model));
  if (!validQuotas.length) return null;
  return (
    <div className={geminiOnly ? "codex-card-limits" : "codex-card-limits antigravity-quota-list"}>
      {validQuotas.map((quota, index) => {
        const fiveKnown = quota.fiveHourPercent !== undefined && quota.fiveHourPercent !== null;
        const weeklyKnown = quota.weeklyPercent !== undefined && quota.weeklyPercent !== null;
        const fiveReset = formatCardResetLabel(
          "antigravity",
          quota.fiveHourReset,
          Boolean(quota.fiveHourDisabled),
        );
        const weeklyReset = formatCardResetLabel(
          "antigravity",
          quota.weeklyReset,
          Boolean(quota.weeklyDisabled),
        );
        return (
          <div
            key={`${quota.model || index}-${index}`}
            className={geminiOnly ? undefined : "antigravity-quota-group"}
          >
            {!geminiOnly && (
              <div className="quota-item-header">
                <span className="quota-model-name" title={quota.model}>
                  <span className="label-full">{quota.model}</span>
                  <span className="label-compact model-icon-compact">
                    <ModelPoolIcon model={quota.model} />
                  </span>
                </span>
              </div>
            )}
            <div
              className="quota-limits-container"
              style={
                geminiOnly
                  ? { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }
                  : undefined
              }
            >
              {[
                {
                  label: "5 hrs",
                  known: fiveKnown,
                  percent: quota.fiveHourPercent,
                  reset: fiveReset,
                },
                {
                  label: "Weekly",
                  known: weeklyKnown,
                  percent: quota.weeklyPercent,
                  reset: weeklyReset,
                },
              ].map((lane) => (
                <div className="quota-limit-col" key={lane.label}>
                  <div className="quota-limit-label-container">
                    <span className="quota-limit-name">
                      <span className="label-full">{lane.label}</span>
                      <span className="label-compact">{formatCompactLimitLabel(lane.label)}</span>
                    </span>
                    <span className="quota-limit-reset">
                      {lane.known ? lane.reset : "Unavailable"}
                    </span>
                  </div>
                  <div
                    className="quota-limit-bar-container"
                    data-usage-tone={getUsageTone(lane.known ? lane.percent : null)}
                    data-tooltip={formatUsageLimitTooltip(
                      lane.label,
                      lane.known ? lane.reset : "Unavailable",
                    )}
                  >
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
