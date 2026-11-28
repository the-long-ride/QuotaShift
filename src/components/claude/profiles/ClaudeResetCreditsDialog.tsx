import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ClaudeAccount } from "../../../utils/claude/claude-account-types";
import {
  CLAUDE_RESET_CREDITS_UPDATED_EVENT,
  formatClaudeResetRetryAt,
  type ClaudeResetCredits,
} from "../../../utils/claude/claude-reset-credits";
import { resolveClaudeDisplayTier } from "../../../utils/claude/claude-tier-summary";
import { formatResetTimeRemaining } from "../../../utils/codex/codex-reset-credits";
import { ResetCreditsDialog, type ResetCreditEntry } from "../../common/dialogs/ResetCreditsDialog";

const CLAUDE_USAGE_SETTINGS_URL = "https://claude.ai/settings/usage";

async function openClaudeUsageSettings(): Promise<void> {
  try {
    await openUrl(CLAUDE_USAGE_SETTINGS_URL);
  } catch {
    window.open(CLAUDE_USAGE_SETTINGS_URL, "_blank", "noopener,noreferrer");
  }
}

interface ClaudeResetCreditsDialogProps {
  isOpen: boolean;
  account: ClaudeAccount | null;
  credits: ClaudeResetCredits | null;
  isLoading?: boolean;
  onClose: () => void;
}

function formatGrantExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "No expiry reported";
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime()) ? expiresAt : date.toLocaleString();
}

export const ClaudeResetCreditsDialog: React.FC<ClaudeResetCreditsDialogProps> = ({
  isOpen,
  account,
  credits: initialCredits,
  isLoading = false,
  onClose,
}) => {
  const [refreshedCredits, setRefreshedCredits] = useState<ClaudeResetCredits | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setRefreshedCredits(null);
    setIsRefreshing(false);
  }, [account?.id, isOpen, initialCredits]);

  if (!isOpen || !account) return null;

  const credits = refreshedCredits ?? initialCredits;
  const accountName = account.profileName || account.email || "Claude Code account";
  const accountDetail = account.email ?? account.configDir;
  const resolvedTier = resolveClaudeDisplayTier(account.subscriptionType, account.rateLimitTier);
  const plan = resolvedTier === "OTHER" ? "Plan unknown" : resolvedTier;
  const retryAt = formatClaudeResetRetryAt(credits?.retryAfterAt);
  const emptyMessage = isLoading
    ? "Loading reset credits..."
    : credits?.status === "none"
      ? "No reset credits reported for this account."
      : credits?.reason === "surface" || credits?.reason === "cli_version"
        ? "Claude CLI OAuth does not expose this account's saved reset credits. The count in Claude Desktop may differ; check Settings > Usage there."
        : credits?.reason || "Reset credits are unavailable for this account (not confirmed zero).";

  const showUsageSettingsButton =
    !isLoading && (credits?.status === "ineligible" || credits?.status === "unavailable");
  const showStaleNotice = !isLoading && (Boolean(credits?.stale) || Boolean(retryAt));

  const entries: ResetCreditEntry[] = (credits?.grants ?? []).map((grant, index) => ({
    key: `${grant.expiresAt ?? "open"}-${index}`,
    title: `Grant ${index + 1}`,
    badge: grant.expiresAt
      ? formatResetTimeRemaining(grant.expiresAt)
      : `${grant.resetsLeft} Available`,
    available: grant.resetsLeft > 0,
    expiresAt: grant.expiresAt,
    expiry: formatGrantExpiry(grant.expiresAt),
  }));

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const next = await invoke<ClaudeResetCredits>("get_claude_reset_credits", {
        accountId: account.id,
        extraConfigDirs: [account.configDir],
        force: true,
      });
      setRefreshedCredits(next);
      window.dispatchEvent(
        new CustomEvent(CLAUDE_RESET_CREDITS_UPDATED_EVENT, {
          detail: { accountId: account.id, credits: next },
        }),
      );
    } catch {
      // Preserve last known state when manual refresh fails.
    } finally {
      setIsRefreshing(false);
    }
  };

  const staleNotice = showStaleNotice
    ? retryAt
      ? `Showing cached reset count (rate limited). Next retry after ${retryAt}.`
      : "Showing cached reset count while rate-limit cooldown is active."
    : null;

  const dialogActions =
    showUsageSettingsButton || showStaleNotice ? (
      <div className="claude-reset-dialog-actions">
        <button
          type="button"
          className="codex-model-dialog-rescan-btn"
          disabled={isRefreshing}
          data-tooltip="Refresh Claude reset credits"
          onClick={() => void handleManualRefresh()}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
        {showUsageSettingsButton && (
          <button
            type="button"
            className="codex-model-dialog-rescan-btn"
            data-tooltip="Open Claude usage settings in browser"
            onClick={() => void openClaudeUsageSettings()}
          >
            Open Claude Usage Settings
          </button>
        )}
      </div>
    ) : null;

  return (
    <ResetCreditsDialog
      accountName={accountName}
      accountDetail={accountDetail}
      plan={plan}
      count={credits?.count ?? null}
      credits={entries}
      emptyMessage={emptyMessage}
      notice={staleNotice}
      actions={dialogActions}
      onClose={onClose}
    />
  );
};
