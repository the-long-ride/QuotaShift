import React, { useMemo, useState, useRef, useEffect } from "react";
import { AntigravityAccount } from "../../utils/common/types";
import { formatLastUsed } from "../../utils/account/account-last-used";
import { computeAntigravityTierSummary } from "../../utils/antigravity/antigravity-tier-summary";
import { AntigravityQuotaRows } from "./AntigravityQuotaRows";
import { usePointerCardReorder } from "../../hooks/usePointerCardReorder";
import { useAccountCardGridColumns } from "../../hooks/useAccountCardGridColumns";
import { useAccountRename } from "../../hooks/useAccountRename";
import { TrackCurrentAccountIcon } from "../common/TrackCurrentAccountIcon";
import { filterAccountsByQuery } from "../../utils/account/account-search";
import { AntigravityTabBaseProps } from "./antigravity-tab-types";
import { useLocalAntigravitySession } from "./useLocalAntigravitySession";
import { emailBaseStyle, resolveAntigravityCardDisplay } from "./antigravity-card-helpers";
import { AntigravityLocalSessionCard } from "./AntigravityLocalSessionCard";
import { AntigravityCardHeader } from "./AntigravityCardHeader";
import { AntigravityCardPlan } from "./AntigravityCardPlan";
import { AntigravityEmptyState } from "./AntigravityEmptyState";
import { AntigravityExactErrorBanner } from "./AntigravityExactErrorBanner";
import { AddPlusIcon, BestStarIcon } from "./AntigravityIcons";
import { AccountSortMenu } from "../common/AccountSortMenu";
import { sortAntigravityAccountIds } from "../../utils/account/account-sort";

export interface AntigravityTabProps extends AntigravityTabBaseProps {
  trackedAccountId?: string | null;
}

export const AntigravityTab: React.FC<AntigravityTabProps> = ({
  accounts,
  activeId,
  appliedId,
  trackedAccountId,
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
  onAddLocalSessionToMonitored,
  onTrackCurrentAccount,
  isTrackingCurrentAccount,
  searchQuery,
}) => {
  const session = useLocalAntigravitySession(
    rawLocalSession,
    accounts,
    appliedId,
    antigravityUsageCache,
  );
  const rename = useAccountRename(onRename);
  const isFiltered = Boolean((searchQuery || "").trim());
  const filteredAccounts = useMemo(
    () => filterAccountsByQuery(accounts, searchQuery),
    [accounts, searchQuery],
  );
  const reorder = usePointerCardReorder(filteredAccounts, (ids) => {
    if (!isFiltered) onReorder(ids);
  });
  const accountGridStyle = useAccountCardGridColumns();
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(new Set());
  const prevAvatarsRef = useRef<Record<string, string | undefined>>({});

  useEffect(() => {
    setFailedAvatarIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const a of accounts) {
        if (
          prevAvatarsRef.current[a.id] !== undefined &&
          prevAvatarsRef.current[a.id] !== a.profileUrl &&
          next.has(a.id)
        ) {
          next.delete(a.id);
          changed = true;
        }
        prevAvatarsRef.current[a.id] = a.profileUrl;
      }
      return changed ? next : prev;
    });
  }, [accounts]);

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
    // Single click does nothing; double-click marks as monitored
  };

  const handleCardDoubleClick = (account: AntigravityAccount) => {
    onTrack(account);
  };

  const tierSummary = useMemo(
    () => computeAntigravityTierSummary(filteredAccounts, antigravityUsageCache),
    [filteredAccounts, antigravityUsageCache],
  );

  return (
    <div className="tab-panel tab-panel--active tab-panel--antigravity">
      <div className="account-bar">
        <div className="account-bar-summary">
          <span className="account-bar-total" data-tooltip="Total Antigravity accounts">
            Total: <strong>{tierSummary.total}</strong>
          </span>
          {tierSummary.badges.length > 0 && (
            <div className="account-bar-badges">
              {tierSummary.badges.map(({ tier, count }) => (
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
        <div className="account-bar-actions">
          <button
            className="account-action-btn account-action-btn--add"
            onClick={onAddAccountClick}
            data-tooltip="Connect and add a new Antigravity account"
          >
            <AddPlusIcon />
            Add Account
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
        Double-click a card to monitor in tray · Apply switches active session
      </div>

      <div className="app-content">
        <div
          style={accountGridStyle}
          className={`codex-accounts-container ${reorder.draggingId ? "account-card-grid--reordering" : ""}`}
        >
          <AntigravityLocalSessionCard
            session={session}
            accounts={accounts}
            copiedEmailTooltip={
              copiedEmailId === "local-session" ? "Copied" : "Click to copy email"
            }
            onRefreshQuota={onRefreshQuota}
            onAddLocalSessionToMonitored={onAddLocalSessionToMonitored}
            onAddAccountClick={onAddAccountClick}
            onCopyEmail={handleCopyEmail}
          />

          {accounts.length === 0 && <AntigravityEmptyState />}

          <div ref={reorder.containerRef} className="monitored-account-list">
            {reorder.displayedItems.map((acc) => {
              const isSelected = acc.id === activeId;
              const effectiveTrackedId =
                trackedProvider === "antigravity"
                  ? (trackedAccountId ??
                    (activeId && (!lastFullStatus || !lastFullStatus.monitoredCodex)
                      ? activeId
                      : null))
                  : null;
              const isMonitoredAg = Boolean(effectiveTrackedId && acc.id === effectiveTrackedId);
              const cache = antigravityUsageCache[acc.id];
              const { displayQuotas, displayPlan, displayBalance, avatarUrl } =
                resolveAntigravityCardDisplay(acc, cache);

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
                    displayPlan={displayPlan}
                    avatarUrl={avatarUrl}
                    hasAvatarError={failedAvatarIds.has(acc.id)}
                    rename={rename}
                    dragHandlers={reorder}
                    onAvatarError={(id) => setFailedAvatarIds((p) => new Set(p).add(id))}
                    onRefreshQuota={onRefreshQuota}
                    onReauthenticate={onAddAccountClick}
                    onApply={onApply}
                    onDelete={onDelete}
                  />

                  <div className="codex-card-info antigravity-card-info">
                    <div className="codex-card-plan-wrap antigravity-card-plan-wrap account-card-email-tier-row">
                      <AntigravityCardPlan plan={displayPlan} />
                      {acc.email && (
                        <span
                          className="codex-card-email-info"
                          data-tooltip={copiedEmailId === acc.id ? "Copied" : "Click to copy email"}
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
                      <div className="codex-card-meta">{displayBalance}</div>
                      {formatLastUsed(acc.lastUsedAt) ? (
                        <div className="account-last-used">{formatLastUsed(acc.lastUsedAt)}</div>
                      ) : null}
                    </div>
                  </div>
                  <AntigravityExactErrorBanner error={cache?.error} quotas={displayQuotas} />
                  <AntigravityQuotaRows quotas={displayQuotas} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
