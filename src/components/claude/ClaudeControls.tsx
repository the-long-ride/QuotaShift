import React, { useState } from "react";
import {
  MAX_CLAUDE_POLL_INTERVAL_SECS,
  MAX_CLAUDE_STOP_THRESHOLD_PCT,
  MIN_CLAUDE_POLL_INTERVAL_SECS,
  MIN_CLAUDE_STOP_THRESHOLD_PCT,
  normalizeClaudePreferences,
  type ClaudePreferences,
} from "../../utils/common/claude-preferences";

export { normalizeClaudePreferences };

import { useClaudePreferencesDraft } from "./useClaudePreferencesDraft";

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
    data-tooltip={`${checked ? "Disable" : "Enable"} ${label}`}
    className={`codex-pool-switch ${checked ? "codex-pool-switch--on" : ""}`}
    onClick={() => onChange(!checked)}
  >
    <span className="codex-pool-switch-thumb" />
  </button>
);

export function getCollapsedGuardrailDescription(preferences: ClaudePreferences): string {
  const fiveOn = preferences.fiveHour.enabled;
  const weeklyOn = preferences.weekly.enabled;
  const autoResume = `Auto-resume: ${preferences.autoResumeAtReset ? "ON" : "OFF"}`;
  const runningOnly = `Only watch running Claude accounts: ${preferences.onlyWatchProcessingAccounts ? "ON" : "OFF"}`;

  if (!fiveOn && !weeklyOn) {
    return ` - ${autoResume} - ${runningOnly}`;
  }

  const poll = `${preferences.pollIntervalSecs}s`;
  if (fiveOn && weeklyOn) {
    return ` - ${autoResume} - ${runningOnly} - Poll rate: ${poll} - Suspend eligible Claude Code accounts when usage reaches ${preferences.fiveHour.thresholdPct}% of 5 hrs or ${preferences.weekly.thresholdPct}% of weekly.`;
  }
  if (fiveOn) {
    return ` - ${autoResume} - ${runningOnly} - Poll rate: ${poll} - Suspend eligible Claude Code accounts when usage reaches ${preferences.fiveHour.thresholdPct}% of 5 hrs.`;
  }
  return ` - ${autoResume} - ${runningOnly} - Poll rate: ${poll} - Suspend eligible Claude Code accounts when usage reaches ${preferences.weekly.thresholdPct}% of weekly.`;
}

function renderCollapsedGuardrailDescription(preferences: ClaudePreferences): React.ReactNode {
  return getCollapsedGuardrailDescription(preferences)
    .split(/(ON|OFF)/g)
    .map((part, index) =>
      part === "ON" || part === "OFF" ? <strong key={index}>{part}</strong> : part,
    );
}

export const ClaudeControls: React.FC<ClaudeControlsProps> = ({
  claudePollIntervalSecs,
  onClaudePollIntervalChange,
  claudeStopThresholdPct,
  autoStopArmed,
}) => {
  const {
    preferences,
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
  } = useClaudePreferencesDraft({
    claudePollIntervalSecs,
    claudeStopThresholdPct,
    autoStopArmed,
    onClaudePollIntervalChange,
  });
  const [detailsExpanded, setDetailsExpanded] = useState(
    preferences.fiveHour.enabled || preferences.weekly.enabled,
  );
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
          data-tooltip={
            detailsExpanded ? "Collapse guardrail settings" : "Expand guardrail settings"
          }
        >
          <span className="claude-controls-summary-copy">
            <strong>Claude Code guardrails</strong>
            <span>
              {armed ? "Auto-suspend armed" : "Auto-suspend disabled"}
              {!detailsExpanded && renderCollapsedGuardrailDescription(preferences)}
            </span>
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
          <div className="claude-guardrail-grid">
            <div className="claude-guardrail-settings-left">
              <div className="claude-auto-resume-group">
                <span className="claude-auto-resume-copy">
                  <strong
                    className={`claude-control-label ${preferences.autoResumeAtReset ? "claude-control-label--active" : ""}`}
                  >
                    Auto-resume at quota reset
                  </strong>
                  <small>Resume the same process after all triggered limits reset.</small>
                </span>
                <GuardrailSwitch
                  checked={preferences.autoResumeAtReset}
                  label="Auto-resume Claude Code at quota reset"
                  onChange={(autoResumeAtReset) =>
                    applyPreferences({ ...preferences, autoResumeAtReset })
                  }
                />
              </div>

              <div className="claude-poll-processing-row">
                <div className="claude-processing-watch-group">
                  <span className="claude-processing-watch-copy">
                    <strong
                      className={`claude-control-label ${preferences.onlyWatchProcessingAccounts ? "claude-control-label--active" : ""}`}
                    >
                      Only watch running Claude accounts
                    </strong>
                    <small>Idle accounts use the regular poll rate.</small>
                  </span>
                  <GuardrailSwitch
                    checked={preferences.onlyWatchProcessingAccounts}
                    label="Only watch running Claude accounts"
                    onChange={(onlyWatchProcessingAccounts) =>
                      applyPreferences({ ...preferences, onlyWatchProcessingAccounts })
                    }
                  />
                </div>

                <div className="claude-control-field claude-poll-control claude-poll-control--inline">
                  <span className="claude-poll-copy">
                    <label
                      className={`claude-control-label ${armed ? "claude-control-label--active" : ""}`}
                      htmlFor="claude-poll-rate"
                    >
                      Poll rate
                    </label>
                    <span className="claude-control-note">Recommended 15–30s</span>
                  </span>
                  <span className="claude-poll-input-wrap">
                    <input
                      id="claude-poll-rate"
                      type="number"
                      className="claude-control-input"
                      min={MIN_CLAUDE_POLL_INTERVAL_SECS}
                      max={MAX_CLAUDE_POLL_INTERVAL_SECS}
                      step={1}
                      value={pollDraft}
                      onChange={(event) => handlePollChange(event.target.value)}
                      onBlur={commitPoll}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      aria-label="Claude Code guardrail poll interval in seconds"
                    />
                    <span className="claude-control-unit">s</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="claude-guardrail-settings-right claude-threshold-grid">
              <div className="claude-threshold-control">
                <div className="claude-threshold-heading">
                  <span
                    className={preferences.fiveHour.enabled ? "claude-control-label--active" : ""}
                  >
                    5-hour suspend %
                  </span>
                  <input
                    type="number"
                    className="claude-control-input"
                    min={MIN_CLAUDE_STOP_THRESHOLD_PCT}
                    max={MAX_CLAUDE_STOP_THRESHOLD_PCT}
                    step={1}
                    value={fiveHourDraft}
                    onChange={(event) => handleFiveHourChange(event.target.value)}
                    onBlur={() => commitThreshold("fiveHour", fiveHourDraft)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    aria-label="Claude Code 5-hour auto-suspend threshold percent"
                  />
                  <GuardrailSwitch
                    checked={preferences.fiveHour.enabled}
                    label="Enable 5-hour Claude Code suspend threshold"
                    onChange={(enabled) => toggleWindow("fiveHour", enabled)}
                  />
                </div>
              </div>

              <div className="claude-threshold-control">
                <div className="claude-threshold-heading">
                  <span
                    className={preferences.weekly.enabled ? "claude-control-label--active" : ""}
                  >
                    Weekly suspend %
                  </span>
                  <input
                    type="number"
                    className="claude-control-input"
                    min={MIN_CLAUDE_STOP_THRESHOLD_PCT}
                    max={MAX_CLAUDE_STOP_THRESHOLD_PCT}
                    step={1}
                    value={weeklyDraft}
                    onChange={(event) => handleWeeklyChange(event.target.value)}
                    onBlur={() => commitThreshold("weekly", weeklyDraft)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    aria-label="Claude Code weekly auto-suspend threshold percent"
                  />
                  <GuardrailSwitch
                    checked={preferences.weekly.enabled}
                    label="Enable weekly Claude Code suspend threshold"
                    onChange={(enabled) => toggleWindow("weekly", enabled)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="claude-controls-hint">
            {preferences.onlyWatchProcessingAccounts
              ? "Only profiles with a mapped running process can trigger suspension; others use the regular idle poll rate. "
              : "Guardrails check every discovered Claude Code profile. "}
            The selected poll rate is fastest within 10 percentage points of the 5-hour limit or 3
            points of the weekly limit, then backs off 15% per additional 10 points. Suspension
            turns both guardrails off; re-enable them to resume. With both limits off, Claude Code
            uses the {"Other idle accounts poll rate"}.
          </div>
        </div>
      )}
    </div>
  );
};
