import { useEffect, useState } from "react";
import {
  loadShortcutPreferences,
  SHORTCUTS_CHANGED_EVENT,
  type ShortcutPreferences,
} from "../../utils/common/shortcuts";

export function useShortcutPreferences(): ShortcutPreferences {
  const [preferences, setPreferences] = useState<ShortcutPreferences>(() =>
    loadShortcutPreferences(),
  );

  useEffect(() => {
    const sync = () => setPreferences(loadShortcutPreferences());
    window.addEventListener(SHORTCUTS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(SHORTCUTS_CHANGED_EVENT, sync);
  }, []);

  return preferences;
}
