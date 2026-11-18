import { useState } from "react";
import type { AntigravityAccount, CodexAccount, CodexAccountPool } from "../../utils/common/types";

export function useAppModalState() {
  const [addAgOpen, setAddAgOpen] = useState(false);
  const [reauthAgAccount, setReauthAgAccount] = useState<AntigravityAccount | null>(null);
  const [isCodexModalOpen, setIsCodexModalOpen] = useState(false);
  const [reauthCodexAccount, setReauthCodexAccount] = useState<CodexAccount | null>(null);
  const [poolModalOpen, setPoolModalOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<CodexAccountPool | null>(null);

  return {
    addAgOpen,
    setAddAgOpen,
    reauthAgAccount,
    setReauthAgAccount,
    isCodexModalOpen,
    setIsCodexModalOpen,
    reauthCodexAccount,
    setReauthCodexAccount,
    poolModalOpen,
    setPoolModalOpen,
    editingPool,
    setEditingPool,
  };
}
