import { useState } from "react";
import { useInAppShortcuts } from "./useInAppShortcuts";

interface AppShortcutCoordinator {
  activeTab: "antigravity" | "codex" | "claude";
  setAddAgOpen: (open: boolean) => void;
  setIsCodexModalOpen: (open: boolean) => void;
  themeAndOverlay: {
    handleToggleTheme: () => void;
  };
  bootstrap: {
    triggerRefresh: (force?: boolean) => unknown;
  };
}

export function useAppInAppShortcuts(
  coord: AppShortcutCoordinator,
  cardLayoutMode: "compact" | "expanded",
  onCardLayoutModeChange: (mode: "compact" | "expanded") => void,
) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [claudeAddRequestId, setClaudeAddRequestId] = useState(0);

  useInAppShortcuts({
    addAccount: () => {
      setSettingsOpen(false);
      if (coord.activeTab === "antigravity") coord.setAddAgOpen(true);
      else if (coord.activeTab === "codex") coord.setIsCodexModalOpen(true);
      else setClaudeAddRequestId((requestId) => requestId + 1);
    },
    toggleTheme: coord.themeAndOverlay.handleToggleTheme,
    toggleCardView: () =>
      onCardLayoutModeChange(cardLayoutMode === "compact" ? "expanded" : "compact"),
    focusSearch: () => {
      setSettingsOpen(false);
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLInputElement>(".header-search-input")?.focus();
      });
    },
    refreshAll: () => {
      void coord.bootstrap.triggerRefresh(true);
    },
    openSettings: () => setSettingsOpen(true),
    quitApp: () => {
      setSettingsOpen(false);
      window.requestAnimationFrame(() =>
        window.dispatchEvent(new Event("quotashift-request-quit")),
      );
    },
  });

  return {
    settingsOpen,
    onOpenSettings: () => setSettingsOpen(true),
    onCloseSettings: () => setSettingsOpen(false),
    claudeAddRequestId,
  };
}
