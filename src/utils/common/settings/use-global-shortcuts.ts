import { useEffect, useRef } from "react";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { loadShortcutPreferences } from "./shortcuts";
import { createShortcutRegistrationController } from "./shortcut-registration";

export function useGlobalShortcuts(
  onToggleOverlay: () => void,
  onRefreshAccount: () => void,
): void {
  const toggleRef = useRef(onToggleOverlay);
  const refreshRef = useRef(onRefreshAccount);

  useEffect(() => {
    toggleRef.current = onToggleOverlay;
    refreshRef.current = onRefreshAccount;
  });

  useEffect(() => {
    const controller = createShortcutRegistrationController(
      {
        isRegistered: async (shortcut) => isRegistered(shortcut),
        register: async (shortcut, onPressed) => {
          await register(shortcut, (event) => {
            if (event.state === "Pressed") onPressed();
          });
        },
        unregister: async (shortcuts) => {
          await unregister(shortcuts);
        },
      },
      {
        onToggleOverlay: () => toggleRef.current(),
        onRefreshAccount: () => refreshRef.current(),
      },
    );

    void controller.replace(loadShortcutPreferences());

    const handleChange = () => {
      void controller.replace(loadShortcutPreferences());
    };

    window.addEventListener("quotashift_shortcuts_changed", handleChange);
    return () => {
      window.removeEventListener("quotashift_shortcuts_changed", handleChange);
      void controller.dispose();
    };
  }, []);
}
