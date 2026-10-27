import React, { useMemo } from "react";
import { CliPoolAccountItem } from "../common/CliPoolAccountItem";
import { orderCliPoolAccounts } from "../../utils/cli-pools/account-order";

interface CodexModelPoolV2MembersProps {
  accounts: Array<{
    id: string;
    label?: string;
    email?: string;
    lastPlan?: string;
  }>;
  memberAccountIds: string[];
  onChange: (memberAccountIds: string[]) => void;
}

export const CodexModelPoolV2Members: React.FC<CodexModelPoolV2MembersProps> = ({
  accounts,
  memberAccountIds,
  onChange,
}) => {
  const orderedAccounts = useMemo(
    () => orderCliPoolAccounts(accounts, memberAccountIds),
    [accounts, memberAccountIds],
  );

  const handleToggle = (id: string) => {
    if (memberAccountIds.includes(id)) {
      onChange(memberAccountIds.filter((item) => item !== id));
    } else {
      onChange([...memberAccountIds, id]);
    }
  };

  const handleMoveUp = (orderIndex: number) => {
    if (orderIndex <= 0) return;
    const next = [...memberAccountIds];
    [next[orderIndex - 1], next[orderIndex]] = [next[orderIndex], next[orderIndex - 1]];
    onChange(next);
  };

  const handleMoveDown = (orderIndex: number) => {
    if (orderIndex < 0 || orderIndex >= memberAccountIds.length - 1) return;
    const next = [...memberAccountIds];
    [next[orderIndex], next[orderIndex + 1]] = [next[orderIndex + 1], next[orderIndex]];
    onChange(next);
  };

  const handleSelectAll = () => {
    const existing = new Set(memberAccountIds);
    const additions = accounts.filter((a) => !existing.has(a.id)).map((a) => a.id);
    onChange([...memberAccountIds, ...additions]);
  };

  return (
    <div>
      <div className="codex-pool-members-header">
        <span className="codex-field-label">Members ({memberAccountIds.length})</span>
        {accounts.length > 0 && (
          <div className="qs-model-pool-members-actions">
            <button
              type="button"
              className="codex-pool-members-action-btn"
              data-tooltip="Select all accounts"
              onClick={handleSelectAll}
            >
              Select all
            </button>
            <span className="codex-pool-members-divider">/</span>
            <button
              type="button"
              className="codex-pool-members-action-btn"
              data-tooltip="Unselect all accounts"
              onClick={() => onChange([])}
            >
              Unselect all
            </button>
          </div>
        )}
      </div>
      {accounts.length === 0 ? (
        <p className="codex-pool-members-empty">
          No compatible accounts in this authorization mode.
        </p>
      ) : (
        <div className="cli-pool-account-list codex-pool-member-list qs-model-pool-member-list">
          {orderedAccounts.map((account) => {
            const isSelected = memberAccountIds.includes(account.id);
            const orderIndex = memberAccountIds.indexOf(account.id);
            return (
              <CliPoolAccountItem
                key={account.id}
                id={account.id}
                label={account.label || account.email || account.id}
                email={account.email}
                tier={account.lastPlan || "free"}
                isSelected={isSelected}
                orderIndex={orderIndex}
                totalSelected={memberAccountIds.length}
                onToggle={() => handleToggle(account.id)}
                onMoveUp={() => handleMoveUp(orderIndex)}
                onMoveDown={() => handleMoveDown(orderIndex)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
