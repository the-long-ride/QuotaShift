import React from "react";
import type { CodexAccount } from "../../../utils/common/types";
import type { CodexTabProps } from "../CodexTab";
import { CodexAvailableModelsDialog } from "./CodexAvailableModelsDialog";
import { CodexResetDialogWrapper } from "./CodexResetDialogWrapper";
import { CliPoolModal } from "../../common/cli-pools/CliPoolModal";

export const CodexTabDialogs: React.FC<{
  availableModelsAccount: CodexAccount | null;
  resetCreditsAccount: CodexAccount | null;
  codexModelCache: CodexTabProps["codexModelCache"];
  onRescanModels: CodexTabProps["onRescanModels"];
  codexUsageCache: CodexTabProps["codexUsageCache"];
  refreshingIds: Set<string>;
  accounts: CodexAccount[];
  isCliPoolModalOpen: boolean;
  onCloseModels: () => void;
  onCloseResets: () => void;
  onCloseCliPool: () => void;
}> = ({
  availableModelsAccount,
  resetCreditsAccount,
  codexModelCache,
  onRescanModels,
  codexUsageCache,
  refreshingIds,
  accounts,
  isCliPoolModalOpen,
  onCloseModels,
  onCloseResets,
  onCloseCliPool,
}) => (
  <>
    <CodexAvailableModelsDialog
      isOpen={Boolean(availableModelsAccount)}
      account={availableModelsAccount}
      entry={availableModelsAccount ? codexModelCache?.[availableModelsAccount.id] : undefined}
      onClose={onCloseModels}
      onRescan={onRescanModels ?? (() => {})}
    />
    <CodexResetDialogWrapper
      account={resetCreditsAccount}
      usageCache={codexUsageCache}
      isRefreshing={refreshingIds.has(resetCreditsAccount?.id ?? "")}
      onClose={onCloseResets}
    />
    <CliPoolModal
      provider="codex"
      accounts={accounts}
      isOpen={isCliPoolModalOpen}
      onClose={onCloseCliPool}
    />
  </>
);
