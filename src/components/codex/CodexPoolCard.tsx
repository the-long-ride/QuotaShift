import React, { useState } from "react";
import type { CodexAccount, CodexAccountPool, CodexRouterStatus } from "../../utils/common/types";
import { isCodexAccountOAuth } from "../../utils/codex/codex-tier-summary";
import { ApplyAccountIcon } from "../common/ApplyAccountIcon";
import { TrackCurrentAccountIcon } from "../common/TrackCurrentAccountIcon";
import { CodexPoolUsageModal } from "./CodexPoolUsageModal";

interface CodexPoolCardProps {
  pool: CodexAccountPool;
  accounts: CodexAccount[];
  usageCache: Record<string, any>;
  active: boolean;
  routerStatus?: CodexRouterStatus | null;
  onActivate: (pool: CodexAccountPool) => void;
  onEdit: (pool: CodexAccountPool) => void;
  onDelete: (pool: CodexAccountPool) => void;
  onRefreshMember?: (account: CodexAccount) => void | Promise<void>;
}

export const CodexPoolCard: React.FC<CodexPoolCardProps> = ({
  pool,
  accounts,
  usageCache,
  active,
  routerStatus = null,
  onActivate,
  onEdit,
  onDelete,
  onRefreshMember,
}) => {
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const poolInitial = pool.name.trim().charAt(0).toUpperCase() || "P";
  const poolMembers = accounts.filter((account) => pool.accountIds.includes(account.id));
  const oauthMemberCount = poolMembers.filter((account) =>
    isCodexAccountOAuth(account, usageCache[account.id]),
  ).length;
  const apiKeyMemberCount = poolMembers.filter(
    (account) => !isCodexAccountOAuth(account, usageCache[account.id]) && Boolean(account.apiKey),
  ).length;
  const authSummaryParts: string[] = [];
  if (oauthMemberCount > 0) authSummaryParts.push(`OAuth: ${oauthMemberCount}`);
  if (apiKeyMemberCount > 0) authSummaryParts.push(`API Key: ${apiKeyMemberCount}`);
  const authSummary = authSummaryParts.join(", ") || "Pool empty";
  const routedAccount = routerStatus?.lastRoutedAccountId
    ? accounts.find(
        (account) =>
          account.id === routerStatus.lastRoutedAccountId && pool.accountIds.includes(account.id),
      )
    : undefined;
  const routedHere = Boolean(
    active && routerStatus?.running && routedAccount && routerStatus.lastRoutedModel === pool.model,
  );

  return (
    <div className={`account-card codex-pool-card ${active ? "account-card--active" : ""}`}>
      <div className="codex-card-header">
        <div className="codex-card-title-wrap">
          <div className="codex-card-avatar codex-pool-avatar" aria-hidden="true">
            {poolInitial}
          </div>
          <span className="codex-label-text">{pool.name}</span>
          {routedHere && <span className="codex-card-tier-badge">Routing</span>}
        </div>
        <div className="codex-card-header-actions">
          <span className="codex-pool-auth-summary">{authSummary}</span>
          {!active ? (
            <button
              type="button"
              className="card-apply-btn"
              onClick={(event) => {
                event.stopPropagation();
                onActivate(pool);
              }}
              disabled={pool.accountIds.length === 0}
              data-tooltip="Use this pool for routing"
              aria-label="Use this pool for routing"
            >
              <ApplyAccountIcon />
            </button>
          ) : (
            <span
              className="card-active-badge"
              data-tooltip="This pool is selected for Pool Routing"
              aria-label="This pool is selected for Pool Routing"
              role="img"
            >
              <TrackCurrentAccountIcon size={12} gradient />
            </span>
          )}
          <button
            type="button"
            className="codex-pool-usage-btn"
            aria-label="View pool member usage"
            data-tooltip="View member usage"
            onClick={() => setUsageModalOpen(true)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="5" cy="6" r="1.1" fill="currentColor" />
              <circle cx="5" cy="10" r="1.1" fill="currentColor" />
              <circle cx="5" cy="14" r="1.1" fill="currentColor" />
              <path
                d="M8 6h7M8 10h7M8 14h7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="account-action-btn account-action-btn--icon-only codex-pool-edit-btn"
            onClick={() => onEdit(pool)}
            data-tooltip="Edit this model pool"
            aria-label="Edit this model pool"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M12.4445 19.6875H20.9445M14.4443 5.68747L5.44587 14.6859C4.78722 15.3446 4.26719 16.1441 4.10888 17.062C3.94903 17.9888 3.89583 19.139 4.44432 19.6875C4.99281 20.236 6.14299 20.1828 7.0698 20.0229C7.98772 19.8646 8.78722 19.3446 9.44587 18.6859L18.4443 9.68747M14.4443 5.68747C14.4443 5.68747 17.4443 2.68747 19.4443 4.68747C21.4443 6.68747 18.4443 9.68747 18.4443 9.68747M14.4443 5.68747L18.4443 9.68747"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="codex-card-delete-btn"
            onClick={() => onDelete(pool)}
            data-tooltip="Delete this model pool"
            aria-label="Delete this model pool"
          >
            ×
          </button>
        </div>
      </div>

      <div className="codex-card-row codex-pool-card-row">
        <div className="codex-card-info">
          <div className="codex-card-plan-wrap">
            <span className="codex-card-meta">{pool.model}</span>
            <span className="codex-card-meta">
              {pool.accountIds.length} member{pool.accountIds.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      <CodexPoolUsageModal
        isOpen={usageModalOpen}
        pool={pool}
        accounts={accounts}
        usageCache={usageCache}
        onClose={() => setUsageModalOpen(false)}
        onRefreshMember={onRefreshMember}
      />

      {routedAccount && routerStatus?.lastRoutedModel && (
        <div className="codex-pool-route-status">
          Last routed: {routedAccount.label} · {routerStatus.lastRoutedModel}
        </div>
      )}
    </div>
  );
};
