import { ClaudeResetUnavailableBadge } from "./ClaudeResetUnavailableBadge";
import { ClaudeStackedAvatar } from "./ClaudeStackedAvatar";
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ClaudeAccount } from "../../utils/common/types";
import { resolveClaudeDisplayTier } from "../../utils/claude/claude-tier-summary";
import { buildClaudeTierTooltip } from "../../utils/claude/claude-tier-tooltip";
import { buildClaudeResetCountTooltip } from "../../utils/claude/claude-reset-credits";
import { tierBadgeSlug } from "../../utils/common/accounts/tier-badge-slug";
import { useAccountCardGridColumns } from "../../hooks/accounts/useAccountCardGridColumns";
import { useAccountRename } from "../../hooks/accounts/useAccountRename";
import { CardDragHandle } from "../common/CardDragHandle";
import { MonitoredHeartbeatIcon } from "../common/icons/MonitoredHeartbeatIcon";
import { OpenLocationSvgIcon } from "../common/icons/LogIcons";
import { CodexRefreshIcon } from "../codex/CodexIcons";
import { ClaudeResumeIcon } from "./ClaudeResumeIcon";
import { AccountResetCount } from "../common/accounts/AccountResetCount";
import { AccountUsageMeter } from "./ClaudeAccountUsageMeter";
import { ClaudeUnauthenticatedCardBody } from "./ClaudeUnauthenticatedCardBody";
import { AccountQuotaPollingSwitch } from "../common/accounts/AccountQuotaPollingSwitch";
import { accountInitial } from "../../utils/common/accounts/account-initial";
import type { ClaudeAccountCardsProps } from "./claude-account-card-helpers";

export const ClaudeAccountCards: React.FC<ClaudeAccountCardsProps> = ({
  accounts,
  resetCreditsByAccountId,
  trackedAccountId,
  trackedAccountIds = [],
  isClaudeTracked = false,
  guardrailsActive = false,
  onMonitor,
  refreshingAccountIds,
  onRefresh,
  onResume,
  onRename,
  onOpenResets,
  reorder,
}) => {
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);
  const accountGridStyle = useAccountCardGridColumns();
  const rename = useAccountRename<ClaudeAccount>(onRename ?? (() => {}));
  if (!accounts.length) return null;
  return (
    <section className="claude-accounts-section">
      <div
        ref={reorder?.containerRef}
        style={accountGridStyle}
        className={`claude-accounts-flow ${reorder?.draggingId ? "account-card-grid--reordering" : ""}`}
        onPointerMove={reorder?.onPointerMove}
        onPointerUp={reorder?.onPointerUp}
        onPointerCancel={reorder?.onPointerCancel}
      >
        {accounts.map((status) => {
          const account = status.account;
          const isAuthenticated = account.authenticated !== false;
          const email = account.email || account.organizationName || account.configDir;
          const alias = account.profileName || "Claude Code";
          const tier = resolveClaudeDisplayTier(account.subscriptionType, account.rateLimitTier);
          const tierTooltip = buildClaudeTierTooltip(tier, account.rateLimitTier);
          const monitored =
            isAuthenticated &&
            (trackedAccountIds.includes(account.id) ||
              (isClaudeTracked && trackedAccountId === account.id));
          const isRefreshing = refreshingAccountIds?.has(account.id) ?? false;
          const isDragging = reorder?.draggingId === account.id;
          const resetCredits = isAuthenticated ? resetCreditsByAccountId?.[account.id] : undefined;
          const resetCount =
            resetCredits?.status === "available" || resetCredits?.status === "none"
              ? resetCredits.count
              : null;
          const copyEmail = async (event: React.SyntheticEvent<HTMLElement>) => {
            event.stopPropagation();
            if (!account.email) return;
            try {
              await navigator.clipboard.writeText(account.email);
              setCopiedEmailId(account.id);
              window.setTimeout(
                () => setCopiedEmailId((current) => (current === account.id ? null : current)),
                1200,
              );
            } catch {}
          };
          const openConfigPath = async (event: React.SyntheticEvent<HTMLElement>) => {
            event.stopPropagation();
            await invoke("open_path_in_file_manager", { path: account.configDir }).catch(() => {});
          };
          return (
            <article
              key={account.id}
              id={`claude-account-${account.id}`}
              className={`account-card claude-account-card${monitored ? " monitored" : ""}${status.suspended ? " claude-account-card--suspended" : ""}${!isAuthenticated ? " claude-account-card--unauthenticated" : ""}${isDragging ? " account-card--dragging" : ""}`}
              data-sortable-account-id={account.id}
              onClick={(event) => {
                if (reorder?.consumeClickSuppression()) event.stopPropagation();
              }}
              onDoubleClick={isAuthenticated ? () => onMonitor?.(status) : undefined}
              data-tooltip={
                isAuthenticated && onMonitor
                  ? "Double-click to monitor this Claude Code account"
                  : undefined
              }
            >
              <div className="claude-card-header">
                {reorder && (
                  <CardDragHandle
                    onPointerDown={(event) => reorder.onPointerDown(event, account.id)}
                    onPointerMove={reorder.onPointerMove}
                    onPointerUp={reorder.onPointerUp}
                    onPointerCancel={reorder.onPointerCancel}
                  />
                )}
                <div className="claude-card-title-wrap">
                  <div className="claude-card-alias-row">
                    <div className="codex-card-avatar claude-card-avatar" aria-hidden="true">
                      <ClaudeStackedAvatar
                        initial={accountInitial([alias])}
                        logoSize={14}
                        bgClassName="claude-card-avatar-bg"
                        letterClassName="claude-card-avatar-letter"
                      />
                    </div>
                    {monitored && <MonitoredHeartbeatIcon />}
                    {rename.editingId === account.id ? (
                      <input
                        className="codex-label-input"
                        value={rename.editingValue}
                        onChange={(e) => rename.setEditingValue(e.target.value)}
                        onBlur={() => rename.handleRenameSave(account)}
                        onKeyDown={(e) => rename.handleRenameKeyDown(account, e)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="claude-card-alias codex-label-text"
                        onClick={(e) => rename.handleStartRename(account, e)}
                        data-tooltip="Click to rename this account alias"
                      >
                        {alias}
                      </span>
                    )}
                  </div>
                </div>
                <div className="claude-card-actions">
                  {isAuthenticated && (
                    <>
                      <AccountQuotaPollingSwitch
                        provider="claude"
                        accountId={account.id}
                        required={monitored || guardrailsActive}
                      />
                      <ClaudeResetUnavailableBadge
                        credits={resetCredits}
                        onClick={onOpenResets ? (event) => onOpenResets(event, status) : undefined}
                      />
                      <AccountResetCount
                        count={resetCount}
                        stale={resetCredits?.stale}
                        retryAfterAt={resetCredits?.retryAfterAt}
                        tooltip={
                          resetCredits?.stale
                            ? buildClaudeResetCountTooltip(resetCredits)
                            : undefined
                        }
                        onClick={
                          resetCount && resetCount > 0 && onOpenResets
                            ? (event) => onOpenResets(event, status)
                            : undefined
                        }
                      />
                      <button
                        type="button"
                        className={`codex-card-refresh-btn${isRefreshing ? " spinning" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onRefresh?.(account.id);
                        }}
                        disabled={!onRefresh || isRefreshing || status.suspended}
                        data-tooltip={
                          status.suspended
                            ? "Resume this account before refreshing usage"
                            : "Refresh quota for this account"
                        }
                        aria-label={`Refresh quota for ${email}`}
                      >
                        <CodexRefreshIcon />
                      </button>
                      {status.suspended && onResume && (
                        <button
                          type="button"
                          className="claude-account-resume-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            onResume(account.configDir);
                          }}
                          data-tooltip="Resume suspended Claude processes"
                          aria-label="Resume suspended Claude processes"
                        >
                          <ClaudeResumeIcon />
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="claude-account-folder-btn"
                    onClick={openConfigPath}
                    onDoubleClick={(event) => event.stopPropagation()}
                    data-tooltip="Open Claude Code config folder"
                    aria-label="Open Claude Code config folder"
                  >
                    <OpenLocationSvgIcon size={11} />
                  </button>
                </div>
              </div>
              {isAuthenticated ? (
                <>
                  <div className="account-card-email-tier-row">
                    {tier !== "OTHER" && (
                      <>
                        <span
                          className="account-card-plan-badge"
                          data-tier={tierBadgeSlug(tier)}
                          data-tooltip={tierTooltip}
                        >
                          {tier}
                        </span>
                        <span className="claude-card-meta-separator" aria-hidden="true">
                          -
                        </span>
                      </>
                    )}
                    <span
                      className="claude-card-email"
                      role={account.email ? "button" : undefined}
                      tabIndex={account.email ? 0 : undefined}
                      data-tooltip={
                        account.email
                          ? copiedEmailId === account.id
                            ? "Copied"
                            : "Click to copy email"
                          : undefined
                      }
                      onClick={copyEmail}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") void copyEmail(event);
                      }}
                    >
                      {email}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="claude-account-path"
                    onClick={openConfigPath}
                    data-tooltip="Open Claude Code config folder"
                  >
                    {account.configDir}
                  </button>
                  <div className="claude-card-limits">
                    <div className="quota-limits-container">
                      <AccountUsageMeter
                        fullLabel="5h"
                        compactLabel="5HR"
                        tooltipLabel="5 hrs"
                        window={status.fiveHour}
                      />
                      <AccountUsageMeter
                        fullLabel="Weekly"
                        compactLabel="WK"
                        tooltipLabel="Weekly"
                        window={status.sevenDay}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <ClaudeUnauthenticatedCardBody
                  account={account}
                  onOpenConfigPath={openConfigPath}
                />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
