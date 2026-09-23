import React from "react";
import { CodexAccount } from "../../utils/common/types";
import { useAccountRename } from "../../hooks/accounts/useAccountRename";

interface CodexRenameInputProps {
  rename: ReturnType<typeof useAccountRename<CodexAccount>>;
  account: CodexAccount;
}

export const CodexRenameInput: React.FC<CodexRenameInputProps> = ({ rename, account }) => (
  <input
    className="codex-label-input"
    value={rename.editingValue}
    onChange={(e) => rename.setEditingValue(e.target.value)}
    onBlur={() => rename.handleRenameSave(account)}
    onKeyDown={(e) => rename.handleRenameKeyDown(account, e)}
    onClick={(e) => e.stopPropagation()}
    autoFocus
  />
);
