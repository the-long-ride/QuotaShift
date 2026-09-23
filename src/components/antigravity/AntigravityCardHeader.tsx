import React from "react";
import { AntigravityAccount, AntigravityUsageCacheEntry } from "../../utils/common/types";
import { CardDragHandle } from "../common/CardDragHandle";
import { MonitoredHeartbeatIcon } from "../common/MonitoredHeartbeatIcon";
import { AntigravityAccountActions } from "./AntigravityAccountActions";
import { useAccountRename } from "../../hooks/accounts/useAccountRename";
import { classifyAntigravityTier } from "../../utils/antigravity/antigravity-tier-summary";

export interface DragHandlers {
  handlePointerDown: (e: React.PointerEvent<HTMLDivElement>, id: string) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerCancel: () => void;
}

interface AntigravityCardHeaderProps {
  account: AntigravityAccount;
  cache?: AntigravityUsageCacheEntry;
  isApplied: boolean;
  isMonitoredAg: boolean;
  displayPlan: string;
  avatarUrl: string;
  hasAvatarError: boolean;
  rename: ReturnType<typeof useAccountRename<AntigravityAccount>>;
  dragHandlers: DragHandlers;
  onAvatarError: (id: string) => void;
  onRefreshQuota: (acc: AntigravityAccount) => void;
  onReauthenticate: () => void;
  onApply: (acc: AntigravityAccount) => Promise<void>;
  onDelete: (acc: AntigravityAccount) => Promise<void>;
}

export const AntigravityCardHeader: React.FC<AntigravityCardHeaderProps> = ({
  account,
  cache,
  isApplied,
  isMonitoredAg,
  displayPlan,
  avatarUrl,
  hasAvatarError,
  rename,
  dragHandlers,
  onAvatarError,
  onRefreshQuota,
  onReauthenticate,
  onApply,
  onDelete,
}) => {
  const {
    editingId,
    editingValue,
    setEditingValue,
    handleStartRename,
    handleRenameSave,
    handleRenameKeyDown,
  } = rename;

  return (
    <div className="codex-card-header">
      <CardDragHandle
        onPointerDown={(e) => dragHandlers.handlePointerDown(e, account.id)}
        onPointerMove={dragHandlers.handlePointerMove}
        onPointerUp={dragHandlers.handlePointerUp}
        onPointerCancel={dragHandlers.handlePointerCancel}
      />
      <div
        className="codex-card-title-wrap"
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {avatarUrl && !hasAvatarError ? (
          <img
            className="codex-card-avatar"
            src={avatarUrl}
            alt="Avatar"
            referrerPolicy="no-referrer"
            onError={() => onAvatarError(account.id)}
          />
        ) : (
          <div
            className="codex-card-avatar"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "8px",
              fontWeight: "bold",
              background: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            {account.label ? account.label.charAt(0).toUpperCase() : "A"}
          </div>
        )}

        {isMonitoredAg && <MonitoredHeartbeatIcon />}

        {editingId === account.id ? (
          <input
            className="codex-label-input"
            style={{
              width: `${Math.max(4, editingValue.length) * 7.5}px`,
              maxWidth: "160px",
              minWidth: "30px",
            }}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => handleRenameSave(account)}
            onKeyDown={(e) => handleRenameKeyDown(account, e)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span
            className="codex-label-text"
            onClick={(e) => handleStartRename(account, e)}
            data-tooltip="Click to rename this account label"
            style={{
              borderBottom: "1px dashed var(--border-color)",
              paddingBottom: "1px",
            }}
          >
            {account.label}
          </span>
        )}
        {account.email && (
          <span className="codex-card-header-email" title={account.email}>
            {account.email}
          </span>
        )}
        {displayPlan && displayPlan !== "—" && (
          <span className="codex-card-tier-badge">{classifyAntigravityTier(displayPlan)}</span>
        )}
      </div>
      <AntigravityAccountActions
        account={account}
        cache={cache}
        isApplied={isApplied}
        onRefreshQuota={onRefreshQuota}
        onReauthenticate={onReauthenticate}
        onApply={onApply}
        onDelete={onDelete}
      />
    </div>
  );
};
