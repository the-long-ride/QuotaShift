import React from "react";
import { CommonSwitch } from "../CommonSwitch";

export interface CliPoolAccountItemProps {
  id: string;
  label: string;
  email?: string;
  tier: string;
  isSelected: boolean;
  orderIndex: number;
  totalSelected: number;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export const CliPoolAccountItem: React.FC<CliPoolAccountItemProps> = ({
  label,
  email,
  tier,
  isSelected,
  orderIndex,
  totalSelected,
  onToggle,
  onMoveUp,
  onMoveDown,
}) => {
  const displayName = email || label;
  const switchTooltip = isSelected
    ? `Remove ${displayName} from rotation pool`
    : `Add ${displayName} to rotation pool`;

  return (
    <div className={`cli-pool-account-item ${isSelected ? "cli-pool-account-item--selected" : ""}`}>
      <CommonSwitch
        checked={isSelected}
        onToggle={onToggle}
        tooltip={switchTooltip}
        ariaLabel={switchTooltip}
      />

      {isSelected && (
        <span
          className="cli-pool-order-badge"
          data-tooltip={`Rotation position #${orderIndex + 1}`}
        >
          #{orderIndex + 1}
        </span>
      )}

      <div className="cli-pool-account-identity" onClick={onToggle} role="presentation">
        <span className="cli-pool-account-label">{label}</span>
        {email && <span className="cli-pool-account-email">{email}</span>}
      </div>

      <span
        className={`account-tier-badge account-tier-badge--${tier.toLowerCase()}`}
        data-tooltip={`${tier} tier`}
      >
        <span className="account-tier-badge-label">{tier}</span>
      </span>

      {isSelected && (
        <div className="cli-pool-order-actions">
          <button
            type="button"
            className="cli-pool-order-btn"
            data-tooltip="Move account earlier in rotation"
            aria-label={`Move ${displayName} earlier in rotation`}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            disabled={orderIndex === 0}
          >
            ▲
          </button>
          <button
            type="button"
            className="cli-pool-order-btn"
            data-tooltip="Move account later in rotation"
            aria-label={`Move ${displayName} later in rotation`}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            disabled={orderIndex === totalSelected - 1}
          >
            ▼
          </button>
        </div>
      )}
    </div>
  );
};
