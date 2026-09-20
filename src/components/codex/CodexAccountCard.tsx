import React from "react";
import { CodexAccount } from "../../utils/common/types";
import { formatLastUsed } from "../../utils/account/account-last-used";
import { normalizeCodexUsageWindows } from "../../utils/codex/codex-usage-windows";
import { classifyCodexTier, isCodexAccountOAuth } from "../../utils/codex/codex-tier-summary";
import { decodeJwtProfile } from "../../utils/auth/auth";
import { CardDragHandle } from "../common/CardDragHandle";
import { MonitoredHeartbeatIcon } from "../common/MonitoredHeartbeatIcon";
import { CodexModelsIcon } from "./CodexIcons";
import { isAccountReauthenticationError } from "../../utils/account/account-auth-error";
import { isAccountPollingSuspended } from "../../utils/account/account-poll-suspension";
import { ReauthenticateAccountButton } from "../common/ReauthenticateAccountButton";
import { TrackCurrentAccountIcon } from "../common/TrackCurrentAccountIcon";
import { ApplyAccountIcon } from "../common/ApplyAccountIcon";
import { CodexCardUsageLimits } from "./CodexCardUsageLimits";
import { CodexRenameInput } from "./CodexRenameInput";
import { CodexCardError } from "./CodexCardError";
import { CodexCardDeleteBtn } from "./CodexCardDeleteBtn";
import { CodexCardRefreshBtn } from "./CodexCardRefreshBtn";
import { CodexCardPlan } from "./CodexCardPlan";
import {
  resolveCodexAvatarUrl,
  resolveCodexResetCredits,
  codexEmailBaseStyle,
  createCopyEmailHandlers,
} from "./codex-card-helpers";

export interface CodexAccountCardProps {
  account: CodexAccount;
  isSelected: boolean;
  isMonitored: boolean;
  isDragging: boolean;
  currentAppliedId?: string | null;
  cache?: any;
  failedAvatarIds: Set<string>;
  copiedEmailId: string | null;
  rename: any;
  isRefreshing: boolean;
  dragProps: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel?: () => void;
  };
  onCardClick: () => void;
  onCardDoubleClick: (acc: CodexAccount) => void;
  onAvatarError: (id: string) => void;
  onCopyEmail: (id: string, email: string, targetEl?: HTMLElement) => void;
  onRefresh: (e: React.MouseEvent, acc: CodexAccount) => void;
  onReauthenticate: () => void;
  onShowModels: (acc: CodexAccount) => void;
  onApply: (acc: CodexAccount) => void;
  onDelete: (acc: CodexAccount) => void;
  onOpenResets: (e: React.MouseEvent, acc: CodexAccount, cache?: any) => void;
}

export const CodexAccountCard: React.FC<CodexAccountCardProps> = ({
  account: acc,
  isSelected,
  isMonitored,
  isDragging,
  currentAppliedId,
  cache,
  failedAvatarIds,
  copiedEmailId,
  rename,
  isRefreshing,
  dragProps,
  onCardClick,
  onCardDoubleClick,
  onAvatarError,
  onCopyEmail,
  onRefresh,
  onReauthenticate,
  onShowModels,
  onApply,
  onDelete,
  onOpenResets,
}) => {
  const planText = classifyCodexTier(
    cache?.planName ?? acc.lastPlan,
    isCodexAccountOAuth(acc, cache),
  );
  const lastUsedText = formatLastUsed(acc.lastUsedAt);
  const { availableResets, resetsSummary, resetsTooltip } = resolveCodexResetCredits(acc, cache);
  const canOpenResets = availableResets > 0;
  const avatarUrl = resolveCodexAvatarUrl(acc.profileUrl, acc.apiKey, decodeJwtProfile);
  const showReauthenticate =
    isAccountPollingSuspended("codex", acc.id) || isAccountReauthenticationError(cache?.error);

  const copyEmailProps = {
    role: "button" as const,
    tabIndex: 0,
    "data-tooltip": copiedEmailId === acc.id ? "Copied" : "Click to copy email",
    ...createCopyEmailHandlers(acc.id, acc.email, onCopyEmail),
  };

  const handleCardDoubleClick = onCardDoubleClick;

  return (
    <div
      id={`codex-account-${acc.id}`}
      className={`account-card ${isSelected ? "account-card--active" : ""} ${isMonitored ? "monitored" : ""} ${isDragging ? "account-card--dragging" : ""}`}
      data-sortable-account-id={acc.id}
      onClick={onCardClick}
      onDoubleClick={() => handleCardDoubleClick(acc)}
    >
      <div className="codex-card-header">
        <CardDragHandle {...dragProps} />
        <div className="codex-card-title-wrap">
          {avatarUrl && !failedAvatarIds.has(acc.id) ? (
            <img
              className="codex-card-avatar"
              src={avatarUrl}
              alt="Avatar"
              referrerPolicy="no-referrer"
              onError={() => onAvatarError(acc.id)}
            />
          ) : (
            <div className="codex-card-avatar">
              {acc.label ? acc.label.charAt(0).toUpperCase() : "C"}
            </div>
          )}
          {isMonitored && <MonitoredHeartbeatIcon />}
          {rename.editingId === acc.id ? (
            <CodexRenameInput rename={rename} account={acc} />
          ) : (
            <span
              className="codex-label-text"
              onClick={(e) => rename.handleStartRename(acc, e)}
              data-tooltip="Click to rename this account label"
            >
              {acc.label}
            </span>
          )}
          {acc.email && (
            <span className="codex-card-header-email" title={acc.email} {...copyEmailProps}>
              {acc.email}
            </span>
          )}
          {planText && <span className="codex-card-tier-badge">{planText}</span>}
        </div>
        <div className="codex-card-header-actions">
          {showReauthenticate && (
            <ReauthenticateAccountButton onReauthenticate={onReauthenticate} />
          )}
          <CodexCardRefreshBtn account={acc} isRefreshing={isRefreshing} onRefresh={onRefresh} />
          <button
            type="button"
            className="codex-card-models-btn"
            onClick={(e) => {
              e.stopPropagation();
              onShowModels(acc);
            }}
            data-tooltip="Show available models"
            aria-label={`Show available models for ${acc.label}`}
          >
            <CodexModelsIcon />
          </button>
          {acc.id !== currentAppliedId ? (
            <button
              type="button"
              className="card-apply-btn"
              onClick={(e) => {
                e.stopPropagation();
                onApply(acc);
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
          <CodexCardDeleteBtn account={acc} onDelete={onDelete} />
        </div>
      </div>

      <div className="codex-compact-meta-row">
        {planText && <span className="account-card-plan-badge">{planText}</span>}
        {planText && acc.email && (
          <span className="codex-compact-meta-separator" aria-hidden="true">
            -
          </span>
        )}
        {acc.email && (
          <span className="codex-compact-email" title={acc.email} {...copyEmailProps}>
            {acc.email}
          </span>
        )}
        <span className="codex-compact-meta-spacer" />
        {lastUsedText && <span className="codex-compact-last-used">{lastUsedText}</span>}
      </div>

      <div className="codex-card-row">
        <div className="codex-card-info">
          <div className="codex-card-plan-wrap account-card-email-tier-row">
            {planText && <CodexCardPlan planText={planText} />}
            {acc.email && (
              <span
                className="codex-card-email-info"
                {...copyEmailProps}
                style={{ maxWidth: "100%", ...codexEmailBaseStyle }}
              >
                {acc.email}
              </span>
            )}
          </div>
          <div className="codex-card-meta-stack">
            {canOpenResets ? (
              <button
                type="button"
                className="codex-card-meta codex-card-meta--link codex-meta-link"
                onClick={(e) => onOpenResets(e, acc, cache)}
                data-tooltip={resetsTooltip || "Click to view reset credits"}
              >
                {resetsSummary}
              </button>
            ) : (
              <span className="codex-card-meta">{resetsSummary}</span>
            )}
            {lastUsedText && <div className="account-last-used">{lastUsedText}</div>}
          </div>
        </div>

        {cache && !cache.loading && !cache.error && (
          <div className="codex-card-limits">
            <CodexCardUsageLimits
              windows={normalizeCodexUsageWindows(cache.rate_limit)}
              snapshot={cache.snapshot}
              isOAuth={cache.isOAuth}
            />
          </div>
        )}
      </div>

      <CodexCardError error={cache?.error} />
    </div>
  );
};
