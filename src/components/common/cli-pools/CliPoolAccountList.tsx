import React, { useMemo, useState } from "react";
import { orderCliPoolAccounts } from "../../../utils/cli-pools/account-order";
import {
  getAvailableTiers,
  getTierCounts,
  resolveAccountTier,
} from "../../../utils/cli-pools/tier-filter";
import type { CliProvider } from "../../../utils/cli-pools/types";
import { CliPoolAccountItem } from "./CliPoolAccountItem";
import { CliPoolFilters } from "./CliPoolFilters";

export interface CliPoolAccountListProps {
  provider: CliProvider;
  accounts: Array<{
    id: string;
    email?: string;
    label: string;
    lastPlan?: string | null;
    isOAuth?: boolean;
  }>;
  selectedIds: string[];
  onToggleAccount: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onSelectAllVisible: (ids: string[]) => void;
  onClearVisible: (ids: string[]) => void;
}

export const CliPoolAccountList: React.FC<CliPoolAccountListProps> = ({
  provider,
  accounts,
  selectedIds,
  onToggleAccount,
  onMoveUp,
  onMoveDown,
  onSelectAllVisible,
  onClearVisible,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const availableTiers = useMemo(() => getAvailableTiers(provider, accounts), [provider, accounts]);

  const tierCounts = useMemo(() => getTierCounts(provider, accounts), [provider, accounts]);

  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(
    () => new Set(getAvailableTiers(provider, accounts)),
  );

  const handleToggleTier = (tier: string) => {
    setSelectedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) {
        next.delete(tier);
      } else {
        next.add(tier);
      }
      return next;
    });
  };

  const handleSelectAllTiers = () => {
    setSelectedTiers(new Set(availableTiers));
  };

  const handleClearTiers = () => {
    setSelectedTiers(new Set());
  };

  const filteredAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return accounts.filter((acc) => {
      const tier = resolveAccountTier(provider, acc);
      if (!selectedTiers.has(tier)) return false;
      if (!query) return true;
      const matchesEmail = acc.email ? acc.email.toLowerCase().includes(query) : false;
      const matchesLabel = acc.label ? acc.label.toLowerCase().includes(query) : false;
      return matchesEmail || matchesLabel;
    });
  }, [accounts, provider, searchQuery, selectedTiers]);

  const orderedVisibleAccounts = useMemo(
    () => orderCliPoolAccounts(filteredAccounts, selectedIds),
    [filteredAccounts, selectedIds],
  );

  const visibleIds = useMemo(() => filteredAccounts.map((a) => a.id), [filteredAccounts]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedTiers(new Set(availableTiers));
  };

  return (
    <div className="cli-pool-accounts-section">
      <div className="cli-pool-accounts-header">
        <div className="cli-pool-accounts-header-left">
          <span className="cli-pool-label">Member Accounts & Rotation Order</span>
          <span className="cli-pool-count-badge">
            {selectedIds.length} of {accounts.length} selected
          </span>
        </div>
        {filteredAccounts.length > 0 && (
          <div className="cli-pool-accounts-bulk-actions">
            <button
              type="button"
              className="cli-pool-link-btn"
              onClick={() => onSelectAllVisible(visibleIds)}
              data-tooltip="Select all currently visible accounts"
            >
              Select all visible
            </button>
            <span className="cli-pool-divider">/</span>
            <button
              type="button"
              className="cli-pool-link-btn"
              onClick={() => onClearVisible(visibleIds)}
              data-tooltip="Unselect all currently visible accounts"
            >
              Unselect all
            </button>
          </div>
        )}
      </div>

      <CliPoolFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        availableTiers={availableTiers}
        tierCounts={tierCounts}
        selectedTiers={selectedTiers}
        onToggleTier={handleToggleTier}
        onSelectAllTiers={handleSelectAllTiers}
        onClearTiers={handleClearTiers}
      />

      <div className="cli-pool-account-list">
        {orderedVisibleAccounts.length === 0 ? (
          <div className="cli-pool-account-empty">
            <span>No accounts match current filters.</span>
            {(searchQuery || selectedTiers.size < availableTiers.length) && (
              <button
                type="button"
                className="cli-pool-reset-btn"
                onClick={handleResetFilters}
                data-tooltip="Reset search and tier filters"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          orderedVisibleAccounts.map((acc) => {
            const isSelected = selectedIds.includes(acc.id);
            const orderIndex = selectedIds.indexOf(acc.id);
            const tier = resolveAccountTier(provider, acc);
            return (
              <CliPoolAccountItem
                key={acc.id}
                id={acc.id}
                label={acc.label}
                email={acc.email}
                tier={tier}
                isSelected={isSelected}
                orderIndex={orderIndex}
                totalSelected={selectedIds.length}
                onToggle={() => onToggleAccount(acc.id)}
                onMoveUp={() => onMoveUp(orderIndex)}
                onMoveDown={() => onMoveDown(orderIndex)}
              />
            );
          })
        )}
      </div>
    </div>
  );
};
