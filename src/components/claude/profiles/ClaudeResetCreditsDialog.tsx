import React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ClaudeAccount } from "../../../utils/claude/claude-account-types";
import type { ClaudeResetCredits } from "../../../utils/claude/claude-reset-credits";
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
  credits,
  isLoading = false,
  onClose,
}) => {
  if (!isOpen || !account) return null;

  const accountName = account.profileName || account.email || "Claude Code account";
  const accountDetail = account.email ?? account.configDir;
  const plan = (account.subscriptionType || account.rateLimitTier || "Plan unknown").toUpperCase();
  const emptyMessage = isLoading
    ? "Loading reset credits..."
    : credits?.status === "none"
      ? "No reset credits reported for this account."
      : credits?.reason === "surface" || credits?.reason === "cli_version"
        ? "Claude CLI OAuth does not expose this account's saved reset credits. The count in Claude Desktop may differ; check Settings > Usage there."
        : credits?.reason || "Reset credits are unavailable for this account (not confirmed zero).";

  const showUsageSettingsButton =
    !isLoading && (credits?.status === "ineligible" || credits?.status === "unavailable");

  if (showUsageSettingsButton) {
    return (
      <div
        className="dialog-overlay"
        style={{ display: "flex" }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className="dialog-box codex-model-dialog codex-reset-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`Reset credits for ${accountName}`}
          style={{ width: "320px", maxWidth: "90vw" }}
        >
          <div className="dialog-header codex-model-dialog-header">
            <div className="reset-credits-title">
              <span>Rate Limit Reset Credits</span>
              <span className="reset-credits-count">
                {credits?.count === null || credits?.count === undefined
                  ? "Unknown"
                  : `${credits.count} Available`}
              </span>
            </div>
            <button
              className="codex-model-dialog-close"
              type="button"
              onClick={onClose}
              data-tooltip="Close dialog"
              aria-label="Close dialog"
            >
              ×
            </button>
          </div>
          <div className="codex-model-dialog-body reset-credits-body">
            <div className="codex-model-dialog-account reset-credits-account">
              <div className="codex-model-dialog-identity">
                <strong>{accountName}</strong>
                <span>{accountDetail}</span>
              </div>
              <span className="reset-credits-plan">{plan}</span>
            </div>
            <p className="reset-credits-empty">{emptyMessage}</p>
            <button
              type="button"
              className="codex-model-dialog-rescan-btn"
              style={{ alignSelf: "center" }}
              data-tooltip="Open Claude usage settings in browser"
              onClick={() => void openClaudeUsageSettings()}
            >
              Open Claude Usage Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

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

  return (
    <ResetCreditsDialog
      accountName={accountName}
      accountDetail={accountDetail}
      plan={plan}
      count={credits?.count ?? null}
      credits={entries}
      emptyMessage={emptyMessage}
      onClose={onClose}
    />
  );
};
