import React from "react";
import { CodexAccount, CodexAccountPool, CodexRouterStatus } from "../../utils/common/types";
import { CodexPoolCard } from "./CodexPoolCard";
import { useAccountCardGridColumns } from "../../hooks/useAccountCardGridColumns";

interface CodexPoolsListProps {
  pools: CodexAccountPool[];
  accounts: CodexAccount[];
  usageCache: Record<string, any>;
  activePoolId?: string | null;
  routerStatus?: CodexRouterStatus | null;
  onActivatePool: (pool: CodexAccountPool) => void;
  onEditPool: (pool: CodexAccountPool) => void;
  onDeletePool: (pool: CodexAccountPool) => void;
  onRefreshMember?: (account: CodexAccount) => void | Promise<void>;
}

export const CodexPoolsList: React.FC<CodexPoolsListProps> = ({
  pools,
  accounts,
  usageCache,
  activePoolId,
  routerStatus,
  onActivatePool,
  onEditPool,
  onDeletePool,
  onRefreshMember,
}) => {
  const accountGridStyle = useAccountCardGridColumns();

  if (pools.length === 0) {
    return (
      <div style={{ fontSize: "8.5px", color: "var(--text-secondary)", padding: "8px 0" }}>
        No model pools. Create one to combine account capacity for a configured Codex model.
      </div>
    );
  }
  return (
    <div className="codex-accounts-container codex-pools-flow" style={accountGridStyle}>
      {pools.map((pool) => (
        <CodexPoolCard
          key={pool.id}
          pool={pool}
          accounts={accounts}
          usageCache={usageCache}
          active={pool.id === activePoolId}
          routerStatus={routerStatus}
          onActivate={onActivatePool}
          onEdit={onEditPool}
          onDelete={onDeletePool}
          onRefreshMember={onRefreshMember}
        />
      ))}
    </div>
  );
};
