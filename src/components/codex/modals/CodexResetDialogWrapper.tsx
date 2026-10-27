import React from "react";
import { CodexAccount } from "../../../utils/common/types";
import { CodexResetCreditsDialog } from "./CodexResetCreditsDialog";

interface CodexResetDialogWrapperProps {
  account: CodexAccount | null;
  usageCache: Record<string, any>;
  isRefreshing: boolean;
  onClose: () => void;
}

export const CodexResetDialogWrapper: React.FC<CodexResetDialogWrapperProps> = ({
  account,
  usageCache,
  isRefreshing,
  onClose,
}) => {
  if (!account) return null;
  const cache = usageCache[account.id];
  const creditsData =
    cache?.resetCredits ??
    (cache?.rate_limit as any)?.reset_credits ??
    account.resetCredits ??
    null;
  return (
    <CodexResetCreditsDialog
      isOpen={Boolean(account)}
      account={account}
      creditsData={creditsData}
      isLoading={Boolean(cache?.loading || isRefreshing)}
      onClose={onClose}
    />
  );
};
