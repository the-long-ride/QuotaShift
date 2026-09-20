import React, { useState } from "react";
import type { CodexAccount, CodexAccountPool } from "../../utils/common/types";
import { buildCodexPoolMemberUsageRows } from "../../utils/codex/codex-pools";
import { getUsageTone } from "../../utils/common/usage-tone";
import { AccountModalLayout } from "../common/AccountModalLayout";

interface CodexPoolUsageModalProps {
  isOpen: boolean;
  pool: CodexAccountPool;
  accounts: CodexAccount[];
  usageCache: Record<string, any>;
  onClose: () => void;
  onRefreshMember?: (account: CodexAccount) => void | Promise<void>;
}

export const CodexPoolUsageModal: React.FC<CodexPoolUsageModalProps> = ({
  isOpen,
  pool,
  accounts,
  usageCache,
  onClose,
  onRefreshMember,
}) => {
  const rows = buildCodexPoolMemberUsageRows(pool, accounts, usageCache);
  const poolInitial = pool.name.trim().charAt(0).toUpperCase() || "P";
  const [refreshing, setRefreshing] = useState(false);

  const refreshMembers = async () => {
    if (!onRefreshMember || refreshing) return;
    const members = accounts.filter(
      (account) => pool.accountIds.includes(account.id) && !usageCache[account.id]?.loading,
    );
    if (members.length === 0) return;

    setRefreshing(true);
    try {
      await Promise.all(members.map((account) => Promise.resolve(onRefreshMember(account))));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title={`${pool.name} usage`}
      icon={
        <div className="codex-card-avatar codex-pool-avatar" aria-hidden="true">
          {poolInitial}
        </div>
      }
      dialogClassName="dialog-box--pool-usage"
      bodyClassName="codex-pool-usage-modal"
      footerButtons={
        <>
          <button
            type="button"
            className="dialog-btn dialog-btn--secondary"
            data-tooltip="Refresh pool member usage"
            onClick={() => void refreshMembers()}
            disabled={!onRefreshMember || refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="dialog-btn"
            data-tooltip="Close pool usage"
            onClick={onClose}
          >
            Close
          </button>
        </>
      }
    >
      <div className="codex-pool-usage-summary">
        <strong>{pool.model}</strong>
        <span>·</span>
        <span>
          {pool.accountIds.length} member{pool.accountIds.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="codex-pool-usage-columns" aria-hidden="true">
        <span>Account</span>
        <span>Tier</span>
        <span>Usage</span>
      </div>

      <div className="codex-pool-member-usage-list">
        {rows.length === 0 ? (
          <div className="codex-pool-member-usage-empty">No members in this pool.</div>
        ) : (
          rows.map((row) => (
            <div key={row.accountId} className="codex-pool-member-usage-row">
              <span className="codex-pool-member-usage-identity" title={row.identity}>
                {row.identity}
              </span>
              <span className="account-card-plan-badge">{row.tier}</span>
              <span className="codex-pool-member-usage-limits">
                {row.limits.length > 0
                  ? row.limits.map((limit) => (
                      <span key={limit.kind} className="codex-pool-member-usage-limit">
                        <strong>{limit.label}</strong>{" "}
                        <span
                          className="codex-pool-member-usage-percent"
                          data-usage-tone={getUsageTone(limit.remainingPercent)}
                        >
                          {limit.remainingPercent}%
                        </span>
                      </span>
                    ))
                  : row.state === "loading"
                    ? "Refreshing…"
                    : row.state === "error"
                      ? "Refresh failed"
                      : "Usage unavailable"}
              </span>
            </div>
          ))
        )}
      </div>
    </AccountModalLayout>
  );
};
