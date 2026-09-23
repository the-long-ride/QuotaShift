import { useState } from "react";

export function useAccountRename<T extends { id: string; label: string }>(
  onRename: (account: T, newLabel: string) => void,
) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const handleStartRename = (account: T, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(account.id);
    setEditingValue(account.label);
  };

  const handleRenameSave = (account: T) => {
    const trimmed = editingValue.trim();
    if (trimmed && trimmed !== account.label) {
      onRename(account, trimmed);
    }
    setEditingId(null);
  };

  const handleRenameKeyDown = (account: T, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleRenameSave(account);
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  };

  return {
    editingId,
    editingValue,
    setEditingValue,
    handleStartRename,
    handleRenameSave,
    handleRenameKeyDown,
  };
}
