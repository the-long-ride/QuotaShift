import React from "react";
import type { CodexAccount } from "../../utils/common/types";
import type { CodexTierSummary } from "../../utils/codex/codex-tier-summary";
import { sortCodexAccountIds } from "../../utils/account/account-sort";
import { AccountSortMenu } from "../common/AccountSortMenu";
import { AccountTierSummary } from "../common/AccountTierSummary";
import { TrackCurrentAccountIcon } from "../common/TrackCurrentAccountIcon";
import { CodexAddIcon, CodexBestIcon } from "./CodexIcons";
import { useShortcutPreferences } from "../../hooks/desktop/useShortcutPreferences";

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
}) => {
  const shortcuts = useShortcutPreferences();
  return (
    <div className="account-bar">
      <AccountTierSummary
        total={tierSummary.total}
        badges={tierSummary.badges}
        totalTooltip="Total Codex accounts"
      />
      <div className="account-bar-actions">
        <button
          className="account-action-btn account-action-btn--add"
          onClick={onAddAccountClick}
          data-tooltip="Connect and add a new Codex account"
          data-shortcut={shortcuts.addAccount}
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
            data-tooltip="Switch to the Codex account with the highest remaining quota"
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
};
