import React from "react";

export interface AccountTierSummaryBadge {
  tier: string;
  count: number;
}

export interface AccountTierSummaryProps {
  total: number;
  badges: readonly AccountTierSummaryBadge[];
  totalTooltip: string;
}

export const AccountTierSummary: React.FC<AccountTierSummaryProps> = ({
  total,
  badges,
  totalTooltip,
}) => (
  <div className="account-bar-summary">
    <span className="account-bar-total" data-tooltip={totalTooltip}>
      Total: <strong>{total}</strong>
    </span>
    {badges.length > 0 && (
      <div className="account-bar-badges">
        {badges.map(({ tier, count }) => (
          <span
            key={tier}
            className={`account-tier-badge account-tier-badge--${tier.toLowerCase()}`}
            data-tooltip={`${count} ${tier} account${count > 1 ? "s" : ""}`}
          >
            <span className="account-tier-badge-label">{tier}</span>
            <span className="account-tier-badge-sep">-</span>
            <span className="account-tier-badge-count">{count}</span>
          </span>
        ))}
      </div>
    )}
  </div>
);
