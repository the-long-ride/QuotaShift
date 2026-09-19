import { useState, useEffect } from "react";
import {
  loadClaudePreferences,
  normalizeClaudePreferences,
  saveClaudePreferences,
  type ClaudePreferences,
} from "../../utils/common/claude-preferences";

export interface UseClaudePreferencesDraftParams {
  claudePollIntervalSecs: number;
  claudeStopThresholdPct: number;
  autoStopArmed?: boolean;
  onClaudePollIntervalChange?: (secs: number) => void;
}

export function useClaudePreferencesDraft({
  claudePollIntervalSecs,
  claudeStopThresholdPct,
  autoStopArmed,
  onClaudePollIntervalChange,
}: UseClaudePreferencesDraftParams) {
  const [preferences, setPreferences] = useState<ClaudePreferences>(() => loadClaudePreferences());
  const [pollDraft, setPollDraft] = useState(String(preferences.pollIntervalSecs));
  const [fiveHourDraft, setFiveHourDraft] = useState(String(preferences.fiveHour.thresholdPct));
  const [weeklyDraft, setWeeklyDraft] = useState(String(preferences.weekly.thresholdPct));

  useEffect(() => {
    const stored = loadClaudePreferences();
    setPreferences(stored);
    setPollDraft(String(stored.pollIntervalSecs));
    setFiveHourDraft(String(stored.fiveHour.thresholdPct));
    setWeeklyDraft(String(stored.weekly.thresholdPct));
  }, [claudePollIntervalSecs, claudeStopThresholdPct, autoStopArmed]);

  const applyPreferences = (next: ClaudePreferences) => {
    const normalized = normalizeClaudePreferences(next);
    saveClaudePreferences(normalized);
    setPreferences(normalized);
    setPollDraft(String(normalized.pollIntervalSecs));
    setFiveHourDraft(String(normalized.fiveHour.thresholdPct));
    setWeeklyDraft(String(normalized.weekly.thresholdPct));
    return normalized;
  };

  const handlePollChange = (raw: string) => {
    setPollDraft(raw);
  };

  const commitPoll = () => {
    const value = parseInt(pollDraft.trim(), 10);
    if (!Number.isFinite(value)) {
      setPollDraft(String(preferences.pollIntervalSecs));
      return;
    }
    const normalized = applyPreferences({ ...preferences, pollIntervalSecs: value });
    onClaudePollIntervalChange?.(normalized.pollIntervalSecs);
  };

  const handleFiveHourChange = (raw: string) => {
    setFiveHourDraft(raw);
  };

  const handleWeeklyChange = (raw: string) => {
    setWeeklyDraft(raw);
  };

  const commitThreshold = (window: "fiveHour" | "weekly", draft: string) => {
    const value = parseInt(draft.trim(), 10);
    if (!Number.isFinite(value)) {
      const current = preferences[window].thresholdPct;
      window === "fiveHour" ? setFiveHourDraft(String(current)) : setWeeklyDraft(String(current));
      return;
    }
    applyPreferences({
      ...preferences,
      [window]: { ...preferences[window], thresholdPct: value },
    });
  };

  const toggleWindow = (window: "fiveHour" | "weekly", enabled: boolean) => {
    const next = {
      ...preferences,
      [window]: { ...preferences[window], enabled },
    };
    applyPreferences({
      ...next,
      enabled: next.fiveHour.enabled || next.weekly.enabled,
    });
  };

  return {
    preferences,
    setPreferences,
    pollDraft,
    fiveHourDraft,
    weeklyDraft,
    applyPreferences,
    handlePollChange,
    commitPoll,
    handleFiveHourChange,
    handleWeeklyChange,
    commitThreshold,
    toggleWindow,
  };
}
