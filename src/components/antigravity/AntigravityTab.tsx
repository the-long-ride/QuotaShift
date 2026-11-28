import React, { useMemo, useState } from "react";
import { AntigravityAccount } from "../../utils/common/types";
import { formatLastUsed } from "../../utils/account/account-last-used";
import { computeAntigravityTierSummary } from "../../utils/antigravity/quota/antigravity-tier-summary";
import { AntigravityQuotaRows } from "./AntigravityQuotaRows";
import { usePointerCardReorder } from "../../hooks/accounts/usePointerCardReorder";
import { useAccountCardGridColumns } from "../../hooks/accounts/useAccountCardGridColumns";
import { useAccountRename } from "../../hooks/accounts/useAccountRename";
import { TrackCurrentAccountIcon } from "../common/dialogs/TrackCurrentAccountIcon";
import { AntigravityTabBaseProps } from "./modal/antigravity-tab-types";
import { useLocalAntigravitySession } from "./modal/useLocalAntigravitySession";
import {
  computeAntigravityViewState,
  emailBaseStyle,
  resolveAntigravityCardDisplay,
  resolveEffectiveTrackedAntigravityId,
  useFailedAvatarIds,
} from "./modal/antigravity-card-helpers";
import { AntigravityCardHeader } from "./AntigravityCardHeader";
import { AntigravityCardPlan } from "./AntigravityCardPlan";
import { AntigravityEmptyState } from "./AntigravityEmptyState";
import { AntigravityExactErrorBanner } from "./AntigravityExactErrorBanner";
import { AddPlusIcon, BestStarIcon } from "./AntigravityIcons";
import { AccountSortMenu } from "../common/accounts/AccountSortMenu";
import { AccountTierSummary } from "../common/accounts/AccountTierSummary";
import { useShortcutPreferences } from "../../hooks/desktop/useShortcutPreferences";
import { sortAntigravityAccountIds } from "../../utils/account/capture/account-sort";
import { scrollToAccountCard } from "../../utils/common/accounts/account-card-scroll";
import { CliPoolModal } from "../common/cli-pools/CliPoolModal";
export interface AntigravityTabProps extends AntigravityTabBaseProps {
  trackedAccountId?: string | null;
  trackedAccountIds?: string[];
}
export const AntigravityTab: React.FC<AntigravityTabProps> = ({
  accounts,
  activeId,
  appliedId,
  trackedAccountId,
  trackedAccountIds = [],
  trackedProvider = "antigravity",
  lastFullStatus,
  localSession: rawLocalSession,
  antigravityUsageCache,
  onApply,
  onDelete,
  onRename,
  onTrack,
  onRefreshQuota,
  onSwitchBest,
  onReorder,
  onAddAccountClick,
  onReauthenticateAccount,
  onTrackCurrentAccount,
  isTrackingCurrentAccount,
  searchQuery,
}) => {
  const shortcuts = useShortcutPreferences();
  const session = useLocalAntigravitySession(rawLocalSession, accounts, appliedId);
  const rename = useAccountRename(onRename);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const { searchFilteredAccounts, filteredAccounts, isFiltered } = useMemo(
    () => computeAntigravityViewState(accounts, antigravityUsageCache, searchQuery, selectedTier),
    [accounts, antigravityUsageCache, searchQuery, selectedTier],
  );
  const tierSummary = useMemo(
    () => computeAntigravityTierSummary(searchFilteredAccounts, antigravityUsageCache),
    [searchFilteredAccounts, antigravityUsageCache],
  );
  const reorder = usePointerCardReorder(filteredAccounts, (ids) => {
    if (!isFiltered) onReorder(ids);
  });
  const accountGridStyle = useAccountCardGridColumns();
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);
  const { failedAvatarIds, markAvatarFailed } = useFailedAvatarIds(accounts);
  const [isCliPoolModalOpen, setIsCliPoolModalOpen] = useState(false);
  const handleCopyEmail = async (id: string, email: string, targetEl?: HTMLElement) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmailId(id);
      if (targetEl) {
        window.dispatchEvent(
          new CustomEvent("show-tooltip", { detail: { target: targetEl, text: "Copied" } }),
        );
      }
      setTimeout(() => setCopiedEmailId((c) => (c === id ? null : c)), 1500);
    } catch (err) {
      console.error("Failed to copy email:", err);
    }
  };
  const handleCardClick = () => {
    if (reorder.controllerRef.current.consumeClickSuppression()) return;
  };
  const handleCardDoubleClick = (account: AntigravityAccount) => {
    onTrack(account);
    scrollToAccountCard("antigravity", account.id);
  };
  return (
    <div className="tab-panel tab-panel--active tab-panel--antigravity">
      <div className="account-bar">
        <AccountTierSummary
          total={tierSummary.total}
          badges={tierSummary.badges}
          totalTooltip="Total Antigravity accounts"
          selectedTier={selectedTier}
          onTierToggle={(tier) => setSelectedTier((current) => (current === tier ? null : tier))}
        />
        <div className="account-bar-actions">
          <button
            className="account-action-btn account-action-btn--add"
            onClick={onAddAccountClick}
            data-tooltip="Connect an Antigravity account or capture the active local session"
            data-shortcut={shortcuts.addAccount}
          >
            <AddPlusIcon />
            Add Account
          </button>
          <button
            type="button"
            className="account-action-btn"
            onClick={() => setIsCliPoolModalOpen(true)}
            data-tooltip="Manage Antigravity CLI account rotation pools"
          >
            CLI Pools
          </button>
          {onTrackCurrentAccount && (
            <button
              type="button"
              className="account-action-btn account-action-btn--icon-only"
              onClick={onTrackCurrentAccount}
              disabled={isTrackingCurrentAccount}
              aria-label="Monitor Current Account"
              data-tooltip="Monitor the account currently active in the local Antigravity session"
            >
              <TrackCurrentAccountIcon />
            </button>
          )}
          {accounts.length >= 2 && (
            <button
              className="account-action-btn"
              onClick={onSwitchBest}
              data-tooltip="Auto-switch to the Antigravity account with the highest remaining quota"
            >
              <BestStarIcon />
              Best
            </button>
          )}
          <AccountSortMenu
            disabled={accounts.length < 2}
            onSort={(field, direction) =>
              onReorder(
                sortAntigravityAccountIds(accounts, antigravityUsageCache, field, direction),
              )
            }
          />
        </div>
      </div>
      <div className="antigravity-tab-hint">
        Double-click a card to monitor in tray, or double-click again to untrack · Apply switches
        active session
      </div>
      <div className="app-content">
        {accounts.length === 0 || filteredAccounts.length === 0 ? (
          <AntigravityEmptyState totalAccounts={accounts.length} searchQuery={searchQuery} />
        ) : (
          <div
            style={accountGridStyle}
            className={`codex-accounts-container ${reorder.draggingId ? "account-card-grid--reordering" : ""}`}
          >
            <div ref={reorder.containerRef} className="monitored-account-list">
              {reorder.displayedItems.map((acc) => {
                const isSelected = acc.id === activeId;
                const effectiveTrackedId = resolveEffectiveTrackedAntigravityId(
                  trackedProvider,
                  trackedAccountId,
                  activeId,
                  lastFullStatus,
                );
                const isMonitoredAg =
                  trackedAccountIds.includes(acc.id) ||
                  Boolean(effectiveTrackedId && acc.id === effectiveTrackedId);
                const cache = antigravityUsageCache[acc.id];
                const { displayBalance, ...cardDisplay } = resolveAntigravityCardDisplay(
                  acc,
                  cache,
                );

                return (
                  <div
                    key={acc.id}
                    id={`ag-account-${acc.id}`}
                    className={`account-card ${isSelected ? "account-card--active" : ""} ${isMonitoredAg ? "monitored" : ""} ${reorder.draggingId === acc.id ? "account-card--dragging" : ""}`}
                    data-sortable-account-id={acc.id}
                    style={{ cursor: "pointer" }}
                    onClick={handleCardClick}
                    onDoubleClick={() => handleCardDoubleClick(acc)}
                  >
                    <AntigravityCardHeader
                      account={acc}
                      cache={cache}
                      isApplied={acc.id === session.currentLocalSessionAccountId}
                      isMonitoredAg={isMonitoredAg}
                      displayPlan={cardDisplay.displayPlan}
                      premiumModels={cardDisplay.premiumModels}
                      avatarUrl={cardDisplay.avatarUrl}
                      hasAvatarError={failedAvatarIds.has(acc.id)}
                      rename={rename}
                      dragHandlers={reorder}
                      onAvatarError={markAvatarFailed}
                      onRefreshQuota={onRefreshQuota}
                      onReauthenticate={
                        onReauthenticateAccount
                          ? () => onReauthenticateAccount(acc)
                          : onAddAccountClick
                      }
                      onApply={onApply}
                      onDelete={onDelete}
                    />

                    <div className="codex-card-info antigravity-card-info">
                      <div className="codex-card-plan-wrap antigravity-card-plan-wrap account-card-email-tier-row">
                        <AntigravityCardPlan
                          plan={cardDisplay.displayPlan}
                          premiumModels={cardDisplay.premiumModels}
                        />
                        {acc.email && (
                          <span
                            className="codex-card-email-info"
                            data-tooltip={
                              copiedEmailId === acc.id ? "Copied" : "Click to copy email"
                            }
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyEmail(acc.id, acc.email!, e.currentTarget);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                                handleCopyEmail(acc.id, acc.email!, e.currentTarget);
                              }
                            }}
                            style={{ maxWidth: "100%", ...emailBaseStyle }}
                          >
                            {acc.email}
                          </span>
                        )}
                      </div>
                      <div className="codex-card-meta-stack antigravity-card-meta-stack">
                        {displayBalance && <div className="codex-card-meta">{displayBalance}</div>}
                        {formatLastUsed(acc.lastUsedAt) ? (
                          <div className="account-last-used">{formatLastUsed(acc.lastUsedAt)}</div>
                        ) : null}
                      </div>
                    </div>
                    <AntigravityExactErrorBanner
                      error={cache?.error}
                      quotas={cardDisplay.displayQuotas}
                    />
                    <AntigravityQuotaRows
                      quotas={cardDisplay.displayQuotas}
                      imageQuota={cardDisplay.imageQuota}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <CliPoolModal
        provider="agy"
        accounts={accounts}
        isOpen={isCliPoolModalOpen}
        onClose={() => setIsCliPoolModalOpen(false)}
      />
    </div>
  );
};
