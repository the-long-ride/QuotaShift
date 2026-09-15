import React, { useEffect, useState } from "react";
import {
  MAX_CLAUDE_POLL_INTERVAL_SECS,
  MAX_CLAUDE_STOP_THRESHOLD_PCT,
  MIN_CLAUDE_POLL_INTERVAL_SECS,
  MIN_CLAUDE_STOP_THRESHOLD_PCT,
  loadClaudePreferences,
  normalizeClaudePreferences,
  saveClaudePreferences,
  type ClaudePreferences,
} from "../../utils/common/claude-preferences";

export interface ClaudeControlsProps {
  claudePollIntervalSecs: number;
  onClaudePollIntervalChange?: (secs: number) => void;
  claudeStopThresholdPct: number;
  onClaudeStopThresholdChange?: (pct: number) => void;
  autoStopArmed?: boolean;
}

const GuardrailSwitch: React.FC<{
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}> = ({ checked, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={`codex-pool-switch ${checked ? "codex-pool-switch--on" : ""}`}
    onClick={() => onChange(!checked)}
  >
    <span className="codex-pool-switch-thumb" />
  </button>
);

export const ClaudeControls: React.FC<ClaudeControlsProps> = ({
  claudePollIntervalSecs,
  onClaudePollIntervalChange,
  claudeStopThresholdPct,
  autoStopArmed,
}) => {
  const [preferences, setPreferences] = useState<ClaudePreferences>(() => loadClaudePreferences());
  const [detailsExpanded, setDetailsExpanded] = useState(
    preferences.fiveHour.enabled || preferences.weekly.enabled,
  );
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

  const commitPoll = () => {
    const value = parseInt(pollDraft.trim(), 10);
    if (!Number.isFinite(value)) {
      setPollDraft(String(preferences.pollIntervalSecs));
      return;
    }
    const normalized = applyPreferences({ ...preferences, pollIntervalSecs: value });
    onClaudePollIntervalChange?.(normalized.pollIntervalSecs);
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

  const armed = preferences.fiveHour.enabled || preferences.weekly.enabled;

  return (
    <div
      className={`claude-monitor-card claude-controls-card${armed ? " claude-controls-card--enabled" : ""}${detailsExpanded ? "" : " claude-controls-card--collapsed"}`}
    >
      <div className="claude-controls-header">
        <button
          type="button"
          className="claude-controls-summary"
          aria-expanded={detailsExpanded}
          aria-controls="claude-guardrail-details"
          onClick={() => setDetailsExpanded((expanded) => !expanded)}
        >
          <span className="claude-controls-summary-copy">
            <strong>Claude guardrails</strong>
            <span>{armed ? "Auto-stop armed" : "Auto-stop disabled"}</span>
          </span>
          <span className="claude-controls-chevron" aria-hidden="true">
            {detailsExpanded ? (
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M4.29289 8.29289C4.68342 7.90237 5.31658 7.90237 5.70711 8.29289L12 14.5858L18.2929 8.29289C18.6834 7.90237 19.3166 7.90237 19.7071 8.29289C20.0976 8.68342 20.0976 9.31658 19.7071 9.70711L12.7071 16.7071C12.3166 17.0976 11.6834 17.0976 11.2929 16.7071L4.29289 9.70711C3.90237 9.31658 3.90237 8.68342 4.29289 8.29289Z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M8.29289 4.29289C8.68342 3.90237 9.31658 3.90237 9.70711 4.29289L16.7071 11.2929C17.0976 11.6834 17.0976 12.3166 16.7071 12.7071L9.70711 19.7071C9.31658 20.0976 8.68342 20.0976 8.29289 19.7071C7.90237 19.3166 7.90237 18.6834 8.29289 18.2929L14.5858 12L8.29289 5.70711C7.90237 5.31658 7.90237 4.68342 8.29289 4.29289Z"
                  fill="currentColor"
                />
              </svg>
            )}
          </span>
        </button>
      </div>

      {detailsExpanded && (
        <div className="claude-controls-details" id="claude-guardrail-details">
          <label className="claude-control-field claude-poll-control">
            <span className="claude-control-label-row">
              <span className="claude-control-label">Poll rate (sec)</span>
              <span className="claude-control-note">Recommended 15–30s</span>
            </span>
            <input
              type="number"
              className="claude-control-input"
              min={MIN_CLAUDE_POLL_INTERVAL_SECS}
              max={MAX_CLAUDE_POLL_INTERVAL_SECS}
              step={1}
              value={pollDraft}
              onChange={(event) => setPollDraft(event.target.value)}
              onBlur={commitPoll}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              aria-label="Claude guardrail poll interval in seconds"
            />
          </label>

          <div className="claude-threshold-grid">
            <div className="claude-threshold-control">
              <div className="claude-threshold-heading">
                <span>5-hour stop %</span>
                <GuardrailSwitch
                  checked={preferences.fiveHour.enabled}
                  label="Enable 5-hour Claude stop threshold"
                  onChange={(enabled) => toggleWindow("fiveHour", enabled)}
                />
              </div>
              <input
                type="number"
                className="claude-control-input"
                min={MIN_CLAUDE_STOP_THRESHOLD_PCT}
                max={MAX_CLAUDE_STOP_THRESHOLD_PCT}
                step={1}
                value={fiveHourDraft}
                onChange={(event) => setFiveHourDraft(event.target.value)}
                onBlur={() => commitThreshold("fiveHour", fiveHourDraft)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                aria-label="Claude 5-hour auto-stop threshold percent"
              />
            </div>

            <div className="claude-threshold-control">
              <div className="claude-threshold-heading">
                <span>Weekly stop %</span>
                <GuardrailSwitch
                  checked={preferences.weekly.enabled}
                  label="Enable weekly Claude stop threshold"
                  onChange={(enabled) => toggleWindow("weekly", enabled)}
                />
              </div>
              <input
                type="number"
                className="claude-control-input"
                min={MIN_CLAUDE_STOP_THRESHOLD_PCT}
                max={MAX_CLAUDE_STOP_THRESHOLD_PCT}
                step={1}
                value={weeklyDraft}
                onChange={(event) => setWeeklyDraft(event.target.value)}
                onBlur={() => commitThreshold("weekly", weeklyDraft)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                aria-label="Claude weekly auto-stop threshold percent"
              />
            </div>
          </div>

          <div className="claude-controls-hint">
            Enabled limits use this poll rate and stop Claude at the configured usage. With both limits off, Claude uses the global tracked-account poll rate.
          </div>
        </div>
      )}
    </div>
  );
};
