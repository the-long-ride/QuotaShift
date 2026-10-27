import React from "react";
import type { CodexRouterStatus } from "../../utils/common/types";
import { formatCacheHitPercentage, formatCompactTokens } from "./codex-router-server-helpers";

const DOT = "·";

export interface CodexRouterServerStatsProps {
  status: CodexRouterStatus;
  lastAccount: string | null;
}

export const CodexRouterServerStats: React.FC<CodexRouterServerStatsProps> = ({
  status,
  lastAccount,
}) => {
  return (
    <div className="qs-router-server-stats">
      <span className="qs-router-server-chip">
        Requests <strong>{status.routedRequestCount}</strong>
      </span>
      <span className="qs-router-server-chip">
        In flight <strong>{status.inFlightRequests ?? 0}</strong>
      </span>
      <span
        className="qs-router-server-chip"
        data-tooltip={`Input: ${(status.totalInputTokens ?? 0).toLocaleString()} · Output: ${(status.totalOutputTokens ?? 0).toLocaleString()} · Reasoning: ${(status.totalReasoningTokens ?? 0).toLocaleString()}`}
      >
        Tokens{" "}
        <strong>
          {formatCompactTokens(status.totalInputTokens)} in {DOT}{" "}
          {formatCompactTokens(status.totalOutputTokens)} out
        </strong>
      </span>
      <span
        className="qs-router-server-chip"
        data-tooltip={`Cached: ${(status.totalCachedTokens ?? 0).toLocaleString()} tokens across ${status.cacheHitRequests ?? 0} cache-hit requests`}
      >
        Cache{" "}
        <strong>
          {formatCacheHitPercentage(status.totalCachedTokens, status.totalInputTokens)} (
          {formatCompactTokens(status.totalCachedTokens)})
        </strong>
      </span>
      <span className="qs-router-server-chip qs-router-server-chip--wide">
        Last{" "}
        <strong>
          {status.lastRoutedModel
            ? `${status.lastRoutedModel} ${DOT} ${lastAccount}`
            : "no requests yet"}
        </strong>
      </span>
    </div>
  );
};
