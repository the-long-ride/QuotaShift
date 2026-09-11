import React from "react";
import type {
  CodexAccount,
  CodexAccountPool,
  CodexPoolLaneCapacity,
  CodexRouterStatus,
} from "../../utils/common/types";
import { aggregateCodexPoolCapacity } from "../../utils/codex/codex-pools";
import { formatAbsoluteTime } from "../../utils/common/format-time";
import { formatCompactLimitLabel } from "../../utils/common/card-layout-mode";

interface CodexPoolCardProps {
  pool: CodexAccountPool;
  accounts: CodexAccount[];
  usageCache: Record<string, any>;
  active: boolean;
  appliedAccountId: string | null;
  routerStatus?: CodexRouterStatus | null;
  onApply: (pool: CodexAccountPool) => void;
  onEdit: (pool: CodexAccountPool) => void;
  onDelete: (pool: CodexAccountPool) => void;
}

function PoolLane({ name, lane }: { name: string; lane: CodexPoolLaneCapacity }) {
  const pct =
    lane.capacityPoints > 0 ? Math.round((lane.remainingPoints / lane.capacityPoints) * 100) : 0;
  const reset = lane.nextResetAt
    ? formatAbsoluteTime(new Date(lane.nextResetAt * 1000).toISOString())
    : lane.knownMembers > 0
      ? `${lane.remainingPoints}/${lane.capacityPoints} pts`
      : "Unknown";

  return (
    <div className="quota-limit-col">
      <div className="quota-limit-label-container">
        <span className="quota-limit-name" title={name}>
          <span className="label-full">{name}</span>
          <span className="label-compact">{formatCompactLimitLabel(name)}</span>
        </span>
        <span className="quota-limit-reset">{reset}</span>
      </div>
      <div className="quota-limit-bar-container">
        <div className="progress-container">
          <div className="progress-bar progress-bar--codex" style={{ width: `${pct}%` }} />
        </div>
        <span className="quota-value">{lane.knownMembers > 0 ? `${pct}%` : "—"}</span>
      </div>
      <div style={{ fontSize: "8px", color: "var(--text-secondary)", marginTop: "3px" }}>
        {lane.knownMembers}/{lane.totalMembers} members known
      </div>
    </div>
  );
}

export const CodexPoolCard: React.FC<CodexPoolCardProps> = ({
  pool,
  accounts,
  usageCache,
  active,
  appliedAccountId,
  routerStatus = null,
  onApply,
  onEdit,
  onDelete,
}) => {
  const capacity = aggregateCodexPoolCapacity(pool, accounts, usageCache);
  const applied = accounts.find(
    (account) => account.id === appliedAccountId && pool.accountIds.includes(account.id),
  );
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
    <div
      className={`account-card ${active ? "account-card--active" : ""}`}
      style={{ marginBottom: "6px" }}
    >
      <div className="codex-card-header">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="codex-label-text" style={{ fontWeight: 700 }}>
              {pool.name}
            </span>
            {active && (
              <span className="card-active-badge">
                <span className="card-active-dot" />
                {routedHere ? "Routed" : "Active pool"}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "8.5px",
              color: "var(--text-secondary)",
              marginTop: "2px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {pool.model} · {pool.accountIds.length} member{pool.accountIds.length === 1 ? "" : "s"}
            {pool.autoSwitch ? " · Auto-switch" : ""}
          </div>
        </div>
        <div
          className="codex-card-header-actions"
          style={{ display: "flex", alignItems: "center", gap: "4px" }}
        >
          <button
            className="card-apply-btn"
            onClick={() => onApply(pool)}
            disabled={pool.accountIds.length === 0}
          >
            Apply best
          </button>
          <button
            className="account-action-btn"
            onClick={() => onEdit(pool)}
            data-tooltip="Edit this model pool"
          >
            Edit
          </button>
          <button
            className="codex-card-delete-btn"
            onClick={() => onDelete(pool)}
            data-tooltip="Delete this model pool"
          >
            ×
          </button>
        </div>
      </div>

      <div
        className="codex-card-info"
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "9px",
          marginTop: "5px",
        }}
      >
        <span>{applied ? `Applied: ${applied.label}` : "No member currently applied"}</span>
        <span style={{ color: "var(--text-secondary)" }}>
          {capacity.oauthMembers} OAuth · {capacity.apiKeyMembers} API key
        </span>
      </div>

      {routedAccount && routerStatus?.lastRoutedModel && (
        <div className="codex-pool-route-status">
          Last routed: {routedAccount.label} · {routerStatus.lastRoutedModel}
        </div>
      )}

      <div
        className="quota-limits-container"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "8px",
          marginTop: "10px",
        }}
      >
        <PoolLane name="Primary / Session" lane={capacity.primary} />
        <PoolLane name="Secondary / Weekly" lane={capacity.secondary} />
      </div>
    </div>
  );
};
