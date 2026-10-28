import React from "react";
import type { CliRotationPoolV1 } from "../../../utils/cli-pools/types";
import { CommonSwitch } from "../CommonSwitch";
import {
  CliMetaUsersIcon,
  CliMetaAutoSwitchIcon,
  CliMetaWindowsIcon,
  CliMetaFallbackIcon,
  CliEditIcon,
  CliDeleteIcon,
} from "./CliPoolIcons";

export interface CliPoolCardItemProps {
  pool: CliRotationPoolV1;
  isActive: boolean;
  onToggleEnabled: (pool: CliRotationPoolV1) => void;
  onEdit: (pool: CliRotationPoolV1) => void;
  onDelete: (id: string) => void;
}

export const CliPoolCardItem: React.FC<CliPoolCardItemProps> = ({
  pool,
  isActive,
  onToggleEnabled,
  onEdit,
  onDelete,
}) => {
  return (
    <div className={`cli-pool-card ${isActive ? "cli-pool-card--active" : ""}`}>
      <div className="cli-pool-card-header">
        <div className="cli-pool-card-title">
          <span>{pool.name}</span>
          <span
            className={`cli-pool-badge ${isActive ? "cli-pool-badge--active" : "cli-pool-badge--idle"}`}
          >
            {isActive ? "Active" : pool.enabled ? "Configured" : "Disabled"}
          </span>
        </div>
        <div className="cli-pool-card-actions">
          <CommonSwitch
            checked={pool.enabled}
            onToggle={() => onToggleEnabled(pool)}
            tooltip={pool.enabled ? `Disable ${pool.name}` : `Enable ${pool.name}`}
            ariaLabel={`${pool.enabled ? "Disable" : "Enable"} ${pool.name}`}
          />
          <button
            type="button"
            data-tooltip={`Edit ${pool.name}`}
            aria-label={`Edit ${pool.name}`}
            className="cli-pool-action-btn"
            onClick={() => onEdit(pool)}
          >
            <CliEditIcon size={12} />
          </button>
          <button
            type="button"
            data-tooltip={`Delete ${pool.name}`}
            aria-label={`Delete ${pool.name}`}
            className="cli-pool-action-btn cli-pool-action-btn--danger"
            onClick={() => onDelete(pool.id)}
          >
            <CliDeleteIcon size={12} />
          </button>
        </div>
      </div>
      <div className="cli-pool-card-meta">
        <span className="cli-pool-meta-chip">
          <CliMetaUsersIcon />
          <span>{pool.accountIds.length} accounts</span>
        </span>
        <span className="cli-pool-meta-chip">
          <CliMetaAutoSwitchIcon />
          <span>Auto-switch: {pool.autoSwitch ? "On" : "Off"}</span>
        </span>
        <span className="cli-pool-meta-chip">
          <CliMetaWindowsIcon />
          <span>Windows: {pool.triggerWindows.join(", ")}</span>
        </span>
        <span className="cli-pool-meta-chip">
          <CliMetaFallbackIcon />
          <span>Fallback: {pool.fallbackLatestEnabled ? "Yes" : "No"}</span>
        </span>
      </div>
    </div>
  );
};
