import React from "react";
import type { ClaudeAccount } from "../../utils/claude/claude-account-types";
import type { ClaudeResetCredits } from "../../utils/claude/claude-reset-credits";
import { formatResetTimeRemaining } from "../../utils/codex/codex-reset-credits";
import { ResetCreditsDialog, type ResetCreditEntry } from "../common/ResetCreditsDialog";

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
      accountDetail={account.email ?? account.configDir}
      plan={(account.subscriptionType || account.rateLimitTier || "Plan unknown").toUpperCase()}
      count={credits?.count ?? 0}
      credits={entries}
      emptyMessage={
        isLoading
          ? "Loading reset credits..."
          : credits?.status === "none"
            ? "No reset credits reported for this account."
            : credits?.reason || "Reset credits are unavailable for this account."
      }
      onClose={onClose}
    />
  );
};
