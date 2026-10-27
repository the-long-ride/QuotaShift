import React, { useState } from "react";
import type { CodexAccount } from "../../utils/common/types";
import type { SiwcAccountView } from "../../utils/codex/siwc-types";
import type { CodexModelPoolV2 } from "../../utils/codex/codex-pools-v2-types";
import { isCodexAccountOAuth } from "../../utils/codex/codex-tier-summary";
import { CommonSwitch } from "../common/CommonSwitch";

interface CodexModelPoolV2CardProps {
  pool: CodexModelPoolV2;
  accounts: CodexAccount[];
  siwcAccounts?: SiwcAccountView[];
  usageCache: Record<string, any>;
  onToggleEnabled: (pool: CodexModelPoolV2) => void;
  onEdit: (pool: CodexModelPoolV2) => void;
  onDelete: (pool: CodexModelPoolV2) => boolean;
}

export const CodexModelPoolV2Card: React.FC<CodexModelPoolV2CardProps> = ({
  pool,
  accounts,
  siwcAccounts = [],
  usageCache,
  onToggleEnabled,
  onEdit,
  onDelete,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const members = accounts.filter((account) => pool.memberAccountIds.includes(account.id));
  const oauthCount = members.filter((account) =>
    isCodexAccountOAuth(account, usageCache[account.id]),
  ).length;
  const apiKeyCount = members.length - oauthCount;
  const nativeCount = siwcAccounts.filter(
    (account) => pool.memberAccountIds.includes(account.id) && account.isRoutable,
  ).length;
  const authSummary =
    pool.authMode === "siwc"
      ? `ChatGPT: ${nativeCount}/${pool.memberAccountIds.length}`
      : [oauthCount ? `OAuth: ${oauthCount}` : "", apiKeyCount ? `API Key: ${apiKeyCount}` : ""]
          .filter(Boolean)
          .join(", ") || "No accounts";

  return (
    <article
      className={`account-card codex-pool-card qs-model-pool-card${pool.enabled ? " qs-model-pool-card--enabled" : ""}`}
    >
      <div className="codex-card-header qs-model-pool-card-header">
        <div className="codex-card-title-wrap">
          <span className="codex-card-avatar codex-pool-avatar" aria-hidden="true">
            {pool.displayName.trim().charAt(0).toUpperCase() || "P"}
          </span>
          <span className="codex-label-text" data-tooltip={pool.displayName}>
            {pool.displayName}
          </span>
        </div>
        <div className="codex-card-header-actions qs-model-pool-card-actions">
          <span className="codex-pool-auth-summary" data-tooltip={authSummary}>
            {authSummary}
          </span>
          <CommonSwitch
            checked={pool.enabled}
            onToggle={() => onToggleEnabled(pool)}
            tooltip={pool.enabled ? "Disable this model pool" : "Enable this model pool"}
            ariaLabel={`${pool.enabled ? "Disable" : "Enable"} ${pool.displayName} for routing`}
          />
          <button
            type="button"
            className="account-action-btn account-action-btn--icon-only codex-pool-edit-btn"
            data-tooltip="Edit this model pool"
            aria-label={`Edit ${pool.displayName}`}
            onClick={() => onEdit(pool)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
            data-tooltip="Delete this model pool"
            aria-label={`Delete ${pool.displayName}`}
            onClick={() => setConfirmDelete(true)}
          >
            ×
          </button>
        </div>
      </div>
      <div className="qs-model-pool-details">
        <span
          className="qs-model-pool-alias"
          data-tooltip={`Routing alias: ${pool.publicModelName}`}
        >
          {pool.publicModelName}
        </span>
        {pool.publicModelName !== pool.upstreamModelId && (
          <span
            className="qs-model-pool-upstream"
            data-tooltip={`Upstream: ${pool.upstreamModelId}`}
          >
            → {pool.upstreamModelId}
          </span>
        )}
        <span className="qs-model-pool-meta" data-tooltip="Pool members">
          {pool.memberAccountIds.length} member{pool.memberAccountIds.length === 1 ? "" : "s"}
        </span>
        <span className="qs-model-pool-meta" data-tooltip="Account selection policy">
          {pool.routingPolicy}
        </span>
        <span
          className="qs-model-pool-meta"
          data-tooltip={`Max context window: ${(pool.maxContextWindowTokens ?? 400_000).toLocaleString()} tokens`}
        >
          {Math.round((pool.maxContextWindowTokens ?? 400_000) / 1000)}k ctx
        </span>
        <span
          className="qs-model-pool-meta"
          data-tooltip={`Thinking effort: ${pool.reasoningEffort ?? "medium"} (${(pool.thinkingBudgetTokens ?? 8_192).toLocaleString()} tokens)`}
        >
          {pool.reasoningEffort ?? "medium"}
        </span>
        <span
          className="qs-model-pool-meta qs-model-pool-auth-type"
          data-tooltip={
            pool.authMode === "siwc"
              ? "Native ChatGPT authorization, independently verified when routing starts"
              : "OpenAI API key billing"
          }
        >
          {pool.authMode === "siwc" ? "SIWC" : "API"}
        </span>
      </div>
      {confirmDelete && (
        <div
          className="qs-model-pool-delete-confirm"
          role="group"
          aria-label={`Confirm deleting ${pool.displayName}`}
        >
          <span>Delete this pool?</span>
          <button
            type="button"
            className="account-action-btn"
            data-tooltip="Keep this model pool"
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="account-action-btn qs-model-pool-delete-final"
            data-tooltip="Permanently delete this model pool"
            onClick={() => {
              if (onDelete(pool)) setConfirmDelete(false);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </article>
  );
};
