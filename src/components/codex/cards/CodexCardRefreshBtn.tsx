import React from "react";
import { CodexAccount } from "../../../utils/common/types";
import { CodexRefreshIcon } from "../CodexIcons";

interface CodexCardRefreshBtnProps {
  account: CodexAccount;
  isRefreshing: boolean;
  onRefresh: (e: React.MouseEvent, acc: CodexAccount) => void;
}

export const CodexCardRefreshBtn: React.FC<CodexCardRefreshBtnProps> = ({
  account,
  isRefreshing,
  onRefresh,
}) => (
  <button
    type="button"
    className={`codex-card-refresh-btn${isRefreshing ? " spinning" : ""}`}
    onClick={(e) => onRefresh(e, account)}
    data-tooltip="Refresh quota for this account"
    aria-label={`Refresh quota for ${account.label}`}
  >
    <CodexRefreshIcon />
  </button>
);
