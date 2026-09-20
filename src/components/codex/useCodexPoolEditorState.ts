import { useEffect, useState } from "react";
import type { CodexAccountPool, CodexModelSelectionMode } from "../../utils/common/types";
import { validateCodexPoolRequiredFields } from "../../utils/codex/codex-pools";

interface UseCodexPoolEditorStateOptions {
  isOpen: boolean;
  initialPool: CodexAccountPool | null;
  onClose: () => void;
  flatOptionsLength: number;
  onSelectOption: (index: number) => void;
}

export function useCodexPoolEditorState({
  isOpen,
  initialPool,
  onClose,
  flatOptionsLength,
  onSelectOption,
}: UseCodexPoolEditorStateOptions) {
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [modelSelectionMode, setModelSelectionMode] = useState<CodexModelSelectionMode>("manual");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [isModelListOpen, setIsModelListOpen] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const [showRequiredErrors, setShowRequiredErrors] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialPool?.name ?? "");
    setModel(initialPool?.model ?? "");
    setModelSelectionMode(initialPool?.modelSelectionMode ?? "manual");
    setAccountIds(initialPool?.accountIds ?? []);
    setIsModelListOpen(false);
    setActiveOptionIndex(0);
    setShowRequiredErrors(false);
  }, [isOpen, initialPool]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isModelListOpen) {
          setIsModelListOpen(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, isModelListOpen, onClose]);

  const requiredErrors = validateCodexPoolRequiredFields(name, model, accountIds);
  const hasRequiredErrors = Object.keys(requiredErrors).length > 0;

  const toggleAccount = (id: string) =>
    setAccountIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const selectDiscoveredModel = (id: string) => {
    setModel(id);
    setModelSelectionMode("discovered");
    setIsModelListOpen(false);
    setActiveOptionIndex(0);
  };

  const handleModelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsModelListOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsModelListOpen(true);
      setActiveOptionIndex((i) =>
        flatOptionsLength === 0 ? 0 : Math.min(i + 1, flatOptionsLength - 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIsModelListOpen(true);
      setActiveOptionIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && isModelListOpen) {
      e.preventDefault();
      onSelectOption(activeOptionIndex);
    }
  };

  return {
    name,
    setName,
    model,
    setModel,
    modelSelectionMode,
    setModelSelectionMode,
    accountIds,
    setAccountIds,
    isModelListOpen,
    setIsModelListOpen,
    activeOptionIndex,
    setActiveOptionIndex,
    toggleAccount,
    selectDiscoveredModel,
    handleModelKeyDown,
    requiredErrors,
    hasRequiredErrors,
    showRequiredErrors,
    setShowRequiredErrors,
  };
}
