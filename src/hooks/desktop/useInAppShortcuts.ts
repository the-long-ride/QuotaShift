import { useEffect, useRef } from "react";
import { matchesShortcutEvent, type InAppShortcutKey } from "../../utils/common/shortcuts";
import { useShortcutPreferences } from "./useShortcutPreferences";

export interface InAppShortcutHandlers {
  addAccount: () => void;
  toggleTheme: () => void;
  toggleCardView: () => void;
  focusSearch: () => void;
  refreshAll: () => void;
  openSettings: () => void;
  quitApp: () => void;
}

const ACTION_ORDER: InAppShortcutKey[] = [
  "addAccount",
  "toggleTheme",
  "toggleCardView",
  "focusSearch",
  "refreshAll",
  "openSettings",
  "quitApp",
];

export function useInAppShortcuts(handlers: InAppShortcutHandlers): void {
  const preferences = useShortcutPreferences();
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || document.documentElement.dataset.shortcutRecording === "true") return;

      const matchedAction = ACTION_ORDER.find((action) =>
        matchesShortcutEvent(event, preferences[action]),
      );
      if (!matchedAction) return;

      event.preventDefault();
      event.stopPropagation();
      handlersRef.current[matchedAction]();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [preferences]);
}
