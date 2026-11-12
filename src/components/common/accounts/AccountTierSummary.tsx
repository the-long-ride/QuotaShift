import React from "react";

export interface AccountTierSummaryBadge {
  tier: string;
  count: number;
}

export interface AccountTierSummaryProps {
  total: number;
  badges: readonly AccountTierSummaryBadge[];
  totalTooltip: string;
  selectedTier?: string | null;
  onTierToggle?: (tier: string) => void;
}

export const AccountTierSummary: React.FC<AccountTierSummaryProps> = ({
  total,
  badges,
  totalTooltip,
  selectedTier = null,
  onTierToggle,
}) => (
  <div className="account-bar-summary">
    <span className="account-bar-total" data-tooltip={totalTooltip}>
      Total: <strong>{total}</strong>
    </span>
    {badges.length > 0 && (
      <div className="account-bar-badges">
        {badges.map(({ tier, count }) => (
          <button
            type="button"
            key={tier}
            className={`account-tier-badge account-tier-badge--${tier.toLowerCase()} ${selectedTier === tier ? "account-tier-badge--selected" : ""}`}
            data-tooltip={`${count} ${tier} account${count > 1 ? "s" : ""}`}
            aria-pressed={selectedTier === tier}
            aria-label={`Filter ${tier} accounts`}
            disabled={!onTierToggle}
            onClick={() => onTierToggle?.(tier)}
          >
            <span className="account-tier-badge-label">{tier}</span>
            <span className="account-tier-badge-sep">-</span>
            <span className="account-tier-badge-count">{count}</span>
          </button>
        ))}
      </div>
    )}
  </div>
);
