import React from "react";
import { CommonSwitch } from "../CommonSwitch";

export interface CliPoolFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  availableTiers: string[];
  tierCounts: Record<string, number>;
  selectedTiers: Set<string>;
  onToggleTier: (tier: string) => void;
  onSelectAllTiers: () => void;
  onClearTiers: () => void;
}

export const CliPoolFilters: React.FC<CliPoolFiltersProps> = ({
  searchQuery,
  onSearchChange,
  availableTiers,
  tierCounts,
  selectedTiers,
  onToggleTier,
  onSelectAllTiers,
  onClearTiers,
}) => {
  return (
    <div className="cli-pool-filters">
      <div className="cli-pool-search-wrap">
        <input
          type="text"
          className="cli-pool-search-input"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter accounts by email or label..."
          aria-label="Filter accounts by email or label"
        />
        {searchQuery && (
          <button
            type="button"
            className="cli-pool-search-clear-btn"
            onClick={() => onSearchChange("")}
            data-tooltip="Clear account search filter"
            aria-label="Clear account search filter"
          >
            ✕
          </button>
        )}
      </div>

      {availableTiers.length > 0 && (
        <div className="cli-pool-tier-filters">
          <div className="cli-pool-tier-filters-header">
            <span className="cli-pool-tier-filter-title">Filter by Tier</span>
            <div className="cli-pool-tier-quick-actions">
              <button
                type="button"
                className="cli-pool-tier-quick-btn"
                onClick={onSelectAllTiers}
                data-tooltip="Show all account tiers"
              >
                All
              </button>
              <button
                type="button"
                className="cli-pool-tier-quick-btn"
                onClick={onClearTiers}
                data-tooltip="Hide all account tiers"
              >
                None
              </button>
            </div>
          </div>

          <div className="cli-pool-tier-switch-list">
            {availableTiers.map((tier) => {
              const isChecked = selectedTiers.has(tier);
              const count = tierCounts[tier] ?? 0;
              const tooltip = isChecked
                ? `Hide ${tier} accounts (${count})`
                : `Show ${tier} accounts (${count})`;
              return (
                <div
                  key={tier}
                  className={`cli-pool-tier-switch-item ${isChecked ? "cli-pool-tier-switch-item--active" : ""}`}
                  onClick={() => onToggleTier(tier)}
                  role="presentation"
                >
                  <CommonSwitch
                    checked={isChecked}
                    onToggle={() => onToggleTier(tier)}
                    tooltip={tooltip}
                    ariaLabel={`Toggle ${tier} accounts visibility`}
                  />
                  <span className={`account-tier-badge account-tier-badge--${tier.toLowerCase()}`}>
                    <span className="account-tier-badge-label">{tier}</span>
                    <span className="account-tier-badge-sep">-</span>
                    <span className="account-tier-badge-count">{count}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
