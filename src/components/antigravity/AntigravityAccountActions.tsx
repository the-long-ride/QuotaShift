import React from "react";
import type { AntigravityAccount, AntigravityUsageCacheEntry } from "../../utils/common/types";
import { isAccountReauthenticationError } from "../../utils/account/capture/account-auth-error";
import { isAccountPollingSuspended } from "../../utils/account/capture/account-poll-suspension";
import { ReauthenticateAccountButton } from "../common/accounts/ReauthenticateAccountButton";
import { TrackCurrentAccountIcon } from "../common/dialogs/TrackCurrentAccountIcon";
import { ApplyAccountIcon } from "../common/icons/ApplyAccountIcon";
import { CompactRefreshIcon } from "../common/icons/CompactRefreshIcon";
import { AccountQuotaPollingSwitch } from "../common/accounts/AccountQuotaPollingSwitch";

interface AntigravityAccountActionsProps {
  account: AntigravityAccount;
  cache?: AntigravityUsageCacheEntry;
  isApplied: boolean;
  isMonitored: boolean;
  onRefreshQuota: (acc: AntigravityAccount) => void;
  onReauthenticate: () => void;
  onApply: (acc: AntigravityAccount) => Promise<void>;
  onDelete: (acc: AntigravityAccount) => Promise<void>;
}

export const AntigravityAccountActions: React.FC<AntigravityAccountActionsProps> = ({
  account,
  cache,
  isApplied,
  isMonitored,
  onRefreshQuota,
  onReauthenticate,
  onApply,
  onDelete,
}) => {
  const showReauthenticate =
    isAccountPollingSuspended("antigravity", account.id) ||
    isAccountReauthenticationError(cache?.error);

  return (
    <div
      className="codex-card-header-actions"
      style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}
    >
      <AccountQuotaPollingSwitch
        provider="antigravity"
        accountId={account.id}
        required={isMonitored}
      />
      {cache?.lastExactFetchedAt && cache.source !== "exact" && (
        <span className="antigravity-exact-stale">
          Last exact {new Date(cache.lastExactFetchedAt).toLocaleString()}
        </span>
      )}
      {showReauthenticate && <ReauthenticateAccountButton onReauthenticate={onReauthenticate} />}
      <button
        type="button"
        className={`codex-card-refresh-btn${cache?.loading ? " spinning" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onRefreshQuota(account);
        }}
        disabled={cache?.loading}
        data-tooltip="Refresh quota for this account"
        aria-label={`Refresh quota for ${account.label || account.email || account.id}`}
      >
        <CompactRefreshIcon />
      </button>
      {!isApplied ? (
        <button
          type="button"
          className="card-apply-btn"
          onClick={(e) => {
            e.stopPropagation();
            onApply(account);
          }}
          data-tooltip="Set this account as the active workspace account"
          aria-label="Set this account as the active workspace account"
        >
          <ApplyAccountIcon />
        </button>
      ) : (
        <span
          className="card-active-badge"
          data-tooltip="This is currently active account at this device"
          aria-label="This is currently active account at this device"
          role="img"
        >
          <TrackCurrentAccountIcon size={12} gradient />
        </span>
      )}
      <button
        className="codex-card-delete-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(account);
        }}
        data-tooltip="Remove this account from QuotaShift"
      >
        ×
      </button>
    </div>
  );
};
