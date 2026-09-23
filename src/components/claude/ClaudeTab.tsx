import React, { useEffect, useMemo, useState } from "react";
import type { ClaudeAccountUsageStatus, ClaudeMonitorStatus } from "../../utils/common/types";
import type { ClaudeResetCredits } from "../../utils/claude/claude-reset-credits";
import { sortClaudeAccountIds } from "../../utils/account/account-sort";
import { computeClaudeTierSummary } from "../../utils/claude/claude-tier-summary";
import { AccountSortMenu } from "../common/AccountSortMenu";
import { AccountTierSummary } from "../common/AccountTierSummary";
import { TrackCurrentAccountIcon } from "../common/TrackCurrentAccountIcon";
import { ClaudeControls } from "./ClaudeControls";
import { ClaudeAccountCards } from "./ClaudeAccountCards";
import { ClaudeAddAccountModal } from "./ClaudeAddAccountModal";
import { useClaudeTabReorder } from "./useClaudeTabReorder";
import { useShortcutPreferences } from "../../hooks/desktop/useShortcutPreferences";
import { ClaudeResetCreditsDialog } from "./ClaudeResetCreditsDialog";

export interface ClaudeTabProps {
  status: ClaudeMonitorStatus;
  isTracked?: boolean;
  trackedAccountId?: string | null;
  onTrackClaudeAccount?: (status: ClaudeAccountUsageStatus) => void | Promise<void>;
  onTrackCurrentAccount?: () => void | Promise<void>;
  isTrackingCurrentAccount?: boolean;
  onAddProfilePath?: (configDir: string) => Promise<void>;
  addAccountRequestId?: number;
  searchQuery?: string;
  claudePollIntervalSecs?: number;
  onClaudePollIntervalChange?: (secs: number) => void;
  claudeStopThresholdPct?: number;
  onClaudeStopThresholdChange?: (pct: number) => void;
  autoStopArmed?: boolean;
  accountStatuses?: ClaudeAccountUsageStatus[];
  resetCreditsByAccountId?: Readonly<Record<string, ClaudeResetCredits>>;
  refreshingAccountIds?: ReadonlySet<string>;
  onRefreshAccount?: (accountId: string) => void | Promise<void>;
  onResumeAccount?: (configDir: string) => void;
  onReorder?: (orderedIds: string[]) => void;
}

const AddAccountIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" width="10" height="10" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const ClaudeTab: React.FC<ClaudeTabProps> = ({
  status,
  isTracked = false,
  trackedAccountId = null,
  onTrackClaudeAccount,
  onTrackCurrentAccount,
  isTrackingCurrentAccount = false,
  onAddProfilePath,
  addAccountRequestId = 0,
  searchQuery,
  claudePollIntervalSecs = 2,
  onClaudePollIntervalChange,
  claudeStopThresholdPct = 0,
  onClaudeStopThresholdChange,
  autoStopArmed = false,
  accountStatuses = [],
  resetCreditsByAccountId,
  refreshingAccountIds,
  onRefreshAccount,
  onResumeAccount,
  onReorder,
}) => {
  const shortcuts = useShortcutPreferences();
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [resetCreditsStatus, setResetCreditsStatus] = useState<ClaudeAccountUsageStatus | null>(
    null,
  );
  const { filteredAccounts, displayedAccounts, reorder } = useClaudeTabReorder(
    accountStatuses,
    searchQuery,
    onReorder,
  );

  useEffect(() => {
    if (addAccountRequestId > 0 && onAddProfilePath) setAddAccountOpen(true);
  }, [addAccountRequestId, onAddProfilePath]);
  const tierSummary = useMemo(() => computeClaudeTierSummary(filteredAccounts), [filteredAccounts]);
  const handleOpenResets = (
    event: React.MouseEvent<HTMLButtonElement>,
    accountStatus: ClaudeAccountUsageStatus,
  ) => {
    event.stopPropagation();
    setResetCreditsStatus(accountStatus);
  };
  const controls =
    onClaudePollIntervalChange || onClaudeStopThresholdChange ? (
      <ClaudeControls
        claudePollIntervalSecs={claudePollIntervalSecs}
        onClaudePollIntervalChange={onClaudePollIntervalChange}
        claudeStopThresholdPct={claudeStopThresholdPct}
        onClaudeStopThresholdChange={onClaudeStopThresholdChange}
        autoStopArmed={autoStopArmed}
      />
    ) : null;

  return (
    <section className="claude-monitor">
      <div className="account-bar">
        <AccountTierSummary
          total={tierSummary.total}
          badges={tierSummary.badges}
          totalTooltip="Total Claude Code accounts"
        />
        <div className="account-bar-actions">
          {onAddProfilePath && (
            <button
              type="button"
              className="account-action-btn account-action-btn--add"
              onClick={() => setAddAccountOpen(true)}
              data-tooltip="Add a Claude Code profile by CLAUDE_CONFIG_DIR path"
              data-shortcut={shortcuts.addAccount}
            >
              <AddAccountIcon />
              Add Account
            </button>
          )}
          {onTrackCurrentAccount && (
            <button
              type="button"
              className="account-action-btn account-action-btn--icon-only"
              onClick={() => void onTrackCurrentAccount()}
              disabled={isTrackingCurrentAccount}
              aria-label="Monitor Current Claude Code Account"
              data-tooltip="Monitor the account used by the current Claude Code process"
            >
              <TrackCurrentAccountIcon />
            </button>
          )}
          <AccountSortMenu
            disabled={!onReorder || accountStatuses.length < 2}
            onSort={(field, direction) =>
              onReorder?.(sortClaudeAccountIds(accountStatuses, field, direction))
            }
          />
        </div>
      </div>

      {controls}

      <ClaudeAccountCards
        accounts={displayedAccounts}
        resetCreditsByAccountId={resetCreditsByAccountId}
        trackedAccountId={trackedAccountId}
        isClaudeTracked={isTracked}
        onMonitor={onTrackClaudeAccount}
        refreshingAccountIds={refreshingAccountIds}
        onRefresh={onRefreshAccount}
        onResume={onResumeAccount}
        onOpenResets={handleOpenResets}
        reorder={{
          containerRef: reorder.containerRef,
          draggingId: reorder.draggingId,
          onPointerDown: reorder.handlePointerDown,
          onPointerMove: reorder.handlePointerMove,
          onPointerUp: reorder.handlePointerUp,
          onPointerCancel: reorder.handlePointerCancel,
          consumeClickSuppression: () => reorder.controllerRef.current.consumeClickSuppression(),
        }}
      />

      {accountStatuses.length > 0 && filteredAccounts.length === 0 && (
        <div className="claude-monitor-card claude-monitor-state-card">
          <div className="claude-state-dot" />
          <div className="claude-state-content">
            <div className="claude-state-title">No Claude Code accounts match this search</div>
            <div className="claude-state-copy">Try another email, profile name, path, or tier.</div>
          </div>
        </div>
      )}

      {!accountStatuses.length && (
        <div className="claude-monitor-card claude-monitor-state-card">
          <div
            className={`claude-state-dot ${status.error ? "claude-state-dot--error" : status.installed ? "claude-state-dot--ready" : ""}`}
          />
          <div className="claude-state-content">
            <div className="claude-state-title">
              {status.error
                ? "Claude Code account monitoring needs attention"
                : "No Claude Code accounts found"}
            </div>
            <div className="claude-state-copy">
              {status.error ||
                "QuotaShift will show discovered Claude Code subscription accounts here when local profile data is available."}
            </div>
          </div>
        </div>
      )}

      {onAddProfilePath && (
        <ClaudeAddAccountModal
          isOpen={addAccountOpen}
          onClose={() => setAddAccountOpen(false)}
          onAdd={onAddProfilePath}
        />
      )}
      <ClaudeResetCreditsDialog
        isOpen={Boolean(resetCreditsStatus)}
        account={resetCreditsStatus?.account ?? null}
        credits={
          resetCreditsStatus
            ? (resetCreditsByAccountId?.[resetCreditsStatus.account.id] ?? null)
            : null
        }
        onClose={() => setResetCreditsStatus(null)}
      />
    </section>
  );
};
