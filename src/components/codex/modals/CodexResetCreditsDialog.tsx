import React from "react";
import type { CodexAccount } from "../../../utils/common/types";
import {
  type CodexResetCreditsData,
  formatResetDatePair,
  formatResetTimeRemaining,
} from "../../../utils/codex/codex-reset-credits";
import { formatRetryAfterTime } from "../../../utils/common/ui/format-reset-count";
import { ResetCreditsDialog, type ResetCreditEntry } from "../../common/dialogs/ResetCreditsDialog";

interface CodexResetCreditsDialogProps {
  isOpen: boolean;
  account: CodexAccount | null;
  creditsData?: CodexResetCreditsData | null;
  isLoading?: boolean;
  onClose: () => void;
}

export const CodexResetCreditsDialog: React.FC<CodexResetCreditsDialogProps> = ({
  isOpen,
  account,
  creditsData: explicitCreditsData,
  isLoading = false,
  onClose,
}) => {
  if (!isOpen || !account) return null;

  const creditsData = explicitCreditsData ?? account.resetCredits ?? null;
  const credits: ResetCreditEntry[] = (creditsData?.credits ?? []).map((item, index) => {
    const granted = formatResetDatePair(item.granted_at);
    const expires = formatResetDatePair(item.expires_at);
    const remain = formatResetTimeRemaining(item.expires_at);

    return {
      key: item.id ?? String(index),
      title: item.title || "Rate Limit Reset",
      badge: remain !== "N/A" ? remain : item.status || "available",
      available: (item.status || "available") === "available",
      expiresAt: item.expires_at ?? null,
      expiry: expires.local,
      grantedAt: item.granted_at ?? null,
      granted: granted.local !== "N/A" ? granted.local : undefined,
    };
  });

  const plan = (account.lastPlan ?? "Plan unknown").toUpperCase();
  const count = creditsData?.available_count ?? credits.length;
  const emptyMessage = isLoading
    ? "Loading reset credits..."
    : "No reset credits reported for this account.";
  const retryAt = formatRetryAfterTime(creditsData?.retry_after_at);
  const showStaleNotice = !isLoading && (Boolean(creditsData?.stale) || Boolean(retryAt));
  const staleNotice = showStaleNotice
    ? retryAt
      ? `Showing cached reset count (rate limited). Next retry after ${retryAt}.`
      : "Showing cached reset count while rate-limit cooldown is active."
    : null;

  return (
    <ResetCreditsDialog
      accountName={account.label}
      accountDetail={account.email ?? "No email"}
      plan={plan}
      count={count}
      credits={credits}
      emptyMessage={emptyMessage}
      notice={staleNotice}
      onClose={onClose}
    />
  );
};
