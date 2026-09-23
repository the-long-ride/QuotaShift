import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ClaudeAccountUsageStatus, ClaudeRateLimitWindow } from "../../utils/common/types";
import { clampPercent, formatPercent, formatReset } from "../../utils/claude/claude-formatters";
import { classifyClaudeTier } from "../../utils/claude/claude-tier-summary";
import { formatUsageLimitTooltip } from "../../utils/common/format-time";
import { getUsageTone } from "../../utils/common/usage-tone";
import { useAccountCardGridColumns } from "../../hooks/accounts/useAccountCardGridColumns";
import { CardDragHandle } from "../common/CardDragHandle";
import { MonitoredHeartbeatIcon } from "../common/MonitoredHeartbeatIcon";
import { CodexRefreshIcon } from "../codex/CodexIcons";
import { AccountResetCount } from "../common/AccountResetCount";
import type { ClaudeResetCredits } from "../../utils/claude/claude-reset-credits";

const AccountUsageMeter: React.FC<{
  fullLabel: string;
  compactLabel: string;
  tooltipLabel: string;
  window: ClaudeRateLimitWindow | null;
}> = ({ fullLabel, compactLabel, tooltipLabel, window }) => {
  const used = window?.usedPercentage;
  const remaining = used == null ? null : 100 - clampPercent(used);
  const rawReset = window?.resetsAt == null ? "" : formatReset(window.resetsAt);
  const resetLabel = rawReset === "Reset unavailable" ? "" : rawReset;
  const tooltip = resetLabel
    ? formatUsageLimitTooltip(tooltipLabel, resetLabel)
    : `${tooltipLabel} usage limit`;

  return (
    <div className="quota-limit-col claude-quota-col">
      <div className="quota-limit-label-container">
        <span className="quota-limit-name">
          <span className="label-full">{fullLabel}</span>
          <span className="label-compact">{compactLabel}</span>
        </span>
        {resetLabel && <span className="quota-limit-reset">{resetLabel}</span>}
      </div>
      <div
        className="quota-limit-bar-container"
        data-usage-tone={getUsageTone(remaining)}
        data-tooltip={tooltip}
        aria-label={tooltip}
      >
        <div className="progress-container">
          <div
            className="progress-bar"
            style={{ width: `${remaining == null ? 0 : clampPercent(remaining)}%` }}
          />
        </div>
        <span className="quota-value">{remaining == null ? "--" : formatPercent(remaining)}</span>
      </div>
    </div>
  );
};

interface ClaudeCardReorderBindings {
  containerRef: React.RefObject<HTMLDivElement | null>;
  draggingId: string | null;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, id: string) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  consumeClickSuppression: () => boolean;
}

export const ClaudeAccountCards: React.FC<{
  accounts: ClaudeAccountUsageStatus[];
  resetCreditsByAccountId?: Readonly<Record<string, ClaudeResetCredits>>;
  trackedAccountId?: string | null;
  isClaudeTracked?: boolean;
  onMonitor?: (status: ClaudeAccountUsageStatus) => void;
  refreshingAccountIds?: ReadonlySet<string>;
  onRefresh?: (accountId: string) => void | Promise<void>;
  onResume?: (configDir: string) => void;
  onOpenResets?: (
    event: React.MouseEvent<HTMLButtonElement>,
    status: ClaudeAccountUsageStatus,
  ) => void;
  reorder?: ClaudeCardReorderBindings;
}> = ({
  accounts,
  resetCreditsByAccountId,
  trackedAccountId,
  isClaudeTracked = false,
  onMonitor,
  refreshingAccountIds,
  onRefresh,
  onResume,
  onOpenResets,
  reorder,
}) => {
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);
  const accountGridStyle = useAccountCardGridColumns();

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
          const email = account.email || account.organizationName || account.configDir;
          const tier = classifyClaudeTier(account.subscriptionType || account.rateLimitTier);
          const monitored = isClaudeTracked && trackedAccountId === account.id;
          const isRefreshing = refreshingAccountIds?.has(account.id) ?? false;
          const isDragging = reorder?.draggingId === account.id;
          const resetCredits = resetCreditsByAccountId?.[account.id];
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
              className={`account-card claude-account-card${monitored ? " monitored" : ""}${status.suspended ? " claude-account-card--suspended" : ""}${isDragging ? " account-card--dragging" : ""}`}
              data-sortable-account-id={account.id}
              onClick={(event) => {
                if (reorder?.consumeClickSuppression()) event.stopPropagation();
              }}
              onDoubleClick={() => onMonitor?.(status)}
              data-tooltip={
                onMonitor ? "Double-click to monitor this Claude Code account" : undefined
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
                  {monitored && <MonitoredHeartbeatIcon />}
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
                <div className="claude-card-actions">
                  <AccountResetCount
                    count={resetCount}
                    onClick={
                      resetCount && resetCount > 0 && onOpenResets
                        ? (event) => onOpenResets(event, status)
                        : undefined
                    }
                  />
                  {tier !== "OTHER" && <span className="account-card-plan-badge">{tier}</span>}
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
                  {status.suspended && (
                    <span className="claude-account-suspended-badge">
                      Suspended · {status.suspendedProcessCount}
                    </span>
                  )}
                  {status.suspended && onResume && (
                    <button
                      type="button"
                      className="claude-account-resume-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        onResume(account.configDir);
                      }}
                      data-tooltip="Resume suspended Claude processes"
                    >
                      Resume
                    </button>
                  )}
                </div>
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
            </article>
          );
        })}
      </div>
    </section>
  );
};
