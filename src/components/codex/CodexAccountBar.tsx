import React from "react";
import type { CodexAccount } from "../../utils/common/types";
import type { CodexTierSummary } from "../../utils/codex/codex-tier-summary";
import { sortCodexAccountIds } from "../../utils/account/account-sort";
import { AccountSortMenu } from "../common/AccountSortMenu";
import { TrackCurrentAccountIcon } from "../common/TrackCurrentAccountIcon";
import { CodexAddIcon, CodexBestIcon } from "./CodexIcons";

export const CodexAccountBar: React.FC<{
  accounts: CodexAccount[];
  usageCache: Record<string, any>;
  tierSummary: CodexTierSummary;
  onAddAccountClick: () => void;
  onTrackCurrentAccount?: () => void | Promise<void>;
  isTrackingCurrentAccount?: boolean;
  onSwitchBest: () => void;
  onReorder: (orderedIds: string[]) => void;
}> = ({
  accounts,
  usageCache,
  tierSummary,
  onAddAccountClick,
  onTrackCurrentAccount,
  isTrackingCurrentAccount,
  onSwitchBest,
  onReorder,
}) => (
  <div className="account-bar">
    <div className="account-bar-summary">
      <span className="account-bar-total" data-tooltip="Total Codex accounts">
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
        data-tooltip="Connect and add a new Codex account"
      >
        <CodexAddIcon />
        Add Account
      </button>
      {onTrackCurrentAccount && (
        <button
          type="button"
          className="account-action-btn account-action-btn--icon-only"
          onClick={onTrackCurrentAccount}
          disabled={isTrackingCurrentAccount}
          aria-label="Monitor Current Account"
          data-tooltip="Monitor the account currently active in the local ChatGPT Codex session"
        >
          <TrackCurrentAccountIcon />
        </button>
      )}
      {accounts.length >= 2 && (
        <button
          className="account-action-btn"
          onClick={onSwitchBest}
          data-tooltip="Auto-switch to the Codex account with the highest remaining quota"
        >
          <CodexBestIcon />
          Best
        </button>
      )}
      <AccountSortMenu
        disabled={accounts.length < 2}
        onSort={(field, direction) =>
          onReorder(sortCodexAccountIds(accounts, usageCache, field, direction))
        }
      />
    </div>
  </div>
);
