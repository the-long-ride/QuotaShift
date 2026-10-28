import { useState, useEffect } from "react";
import {
  CLAUDE_PREFERENCES_CHANGED_EVENT,
  loadClaudeLowUsageReductionPreference,
  saveClaudeLowUsageReductionPreference,
} from "../../utils/common/settings/claude-preferences";

export function useHeaderClaudeLowUsage(
  propReduceClaudeLowUsage?: boolean,
  propOnToggleReduceClaudeLowUsage?: () => void,
) {
  const [reduceClaudeLowUsage, setReduceClaudeLowUsage] = useState(() =>
    propReduceClaudeLowUsage !== undefined
      ? propReduceClaudeLowUsage
      : loadClaudeLowUsageReductionPreference(),
  );

  useEffect(() => {
    if (propReduceClaudeLowUsage !== undefined) {
      setReduceClaudeLowUsage(propReduceClaudeLowUsage);
    }
  }, [propReduceClaudeLowUsage]);

  useEffect(() => {
    const onSync = () => {
      setReduceClaudeLowUsage(loadClaudeLowUsageReductionPreference());
    };
    window.addEventListener(CLAUDE_PREFERENCES_CHANGED_EVENT, onSync);
    return () => window.removeEventListener(CLAUDE_PREFERENCES_CHANGED_EVENT, onSync);
  }, []);

  const handleToggleReduceClaudeLowUsage = () => {
    const next = !reduceClaudeLowUsage;
    setReduceClaudeLowUsage(next);
    saveClaudeLowUsageReductionPreference(next);
    propOnToggleReduceClaudeLowUsage?.();
  };

  return { reduceClaudeLowUsage, handleToggleReduceClaudeLowUsage };
}
