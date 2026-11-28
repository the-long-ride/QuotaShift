import React from "react";

export const CodexCardPlan: React.FC<{
  planText: string;
  tierSlug?: string;
  tooltip?: string;
}> = ({ planText, tierSlug, tooltip }) => (
  <span className="account-card-plan-badge" data-tier={tierSlug} data-tooltip={tooltip}>
    {planText}
  </span>
);
