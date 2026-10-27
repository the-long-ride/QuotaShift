import React from "react";
import { CodexAccount } from "../../../utils/common/types";

export interface CodexCardDeleteBtnProps {
  account: CodexAccount;
  onDelete: (account: CodexAccount) => void;
}

export const CodexCardDeleteBtn: React.FC<CodexCardDeleteBtnProps> = ({ account, onDelete }) => (
  <button
    className="codex-card-delete-btn"
    onClick={(e) => {
      e.stopPropagation();
      onDelete(account);
    }}
    data-tooltip="Remove this account from QuotaShift"
  >
    ×
  </button>
);
