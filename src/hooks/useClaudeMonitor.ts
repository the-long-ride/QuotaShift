import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ToastKind } from "../components/common/Toast";
import type { ClaudeMonitorStatus } from "../utils/common/types";
import {
  CLAUDE_PREFERENCES_CHANGED_EVENT,
  loadClaudePreferences,
  normalizeClaudePreferences,
  saveClaudePreferences,
  sanitizeClaudePollInterval,
  sanitizeClaudeStopThreshold,
  type ClaudePreferences,
} from "../utils/common/claude-preferences";
import {
  loadTrackedPollIntervalPreference,
  TRACKED_POLL_INTERVAL_CHANGED_EVENT,
} from "../utils/common/poll-interval";
import { claudeAccountMonitorPollIntervalSecs } from "../utils/claude/claude-polling";
import { useClaudeAccountMonitor } from "./useClaudeAccountMonitor";

type ShowToast = (message: string, kind?: ToastKind) => void;

const TRACKED_PROVIDER_KEY = "quotashift_overlay_tracked_provider";
const TRACKED_ACCOUNT_ID_KEY = "quotashift_overlay_tracked_account_id";

const emptyStatus: ClaudeMonitorStatus = {
  installed: false,
  settingsPath: null,
  source: "none",
  session: null,
  localUsage: null,
  error: null,
};

export function useClaudeMonitor(
  showToast: ShowToast,
  platformVisible = true,
  idlePollIntervalSecs = 600,
) {
  const [claudeMonitorStatus, setClaudeMonitorStatus] = useState<ClaudeMonitorStatus>(emptyStatus);
  const [claudePreferences, setClaudePreferences] = useState(() => loadClaudePreferences());
  const [globalPollIntervalSecs, setGlobalPollIntervalSecs] = useState(() =>
    loadTrackedPollIntervalPreference(),
  );
  const preferencesRef = useRef(claudePreferences);
  preferencesRef.current = claudePreferences;
  const trackedProvider =
    typeof window === "undefined" ? null : window.localStorage.getItem(TRACKED_PROVIDER_KEY);
  const isClaudeTracked = trackedProvider === "claude";
  const trackedClaudeAccountId =
    isClaudeTracked && typeof window !== "undefined"
      ? window.localStorage.getItem(TRACKED_ACCOUNT_ID_KEY)
      : null;

  const persistPreferences = useCallback((next: ClaudePreferences) => {
    const normalized = normalizeClaudePreferences(next);
    saveClaudePreferences(normalized);
    preferencesRef.current = normalized;
    setClaudePreferences(normalized);
  }, []);

  const handleClaudePollIntervalChange = useCallback(
    (value: number) => {
      persistPreferences({
        ...preferencesRef.current,
        pollIntervalSecs: sanitizeClaudePollInterval(value),
      });
    },
    [persistPreferences],
  );

  const handleClaudeStopThresholdChange = useCallback(
    (value: number) => {
      const enabled = Number.isFinite(value) && value > 0;
      const threshold = enabled
        ? sanitizeClaudeStopThreshold(value)
        : preferencesRef.current.fiveHour.thresholdPct;
      persistPreferences({
        ...preferencesRef.current,
        enabled,
        fiveHour: { enabled, thresholdPct: threshold },
        weekly: { enabled, thresholdPct: threshold },
      });
    },
    [persistPreferences],
  );

  useEffect(() => {
    const syncClaudePreferences = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as ClaudePreferences) : undefined;
      const next = normalizeClaudePreferences(detail ?? loadClaudePreferences());
      preferencesRef.current = next;
      setClaudePreferences(next);
    };
    const syncGlobalPollInterval = () => {
      setGlobalPollIntervalSecs(loadTrackedPollIntervalPreference());
    };

    window.addEventListener(CLAUDE_PREFERENCES_CHANGED_EVENT, syncClaudePreferences);
    window.addEventListener(TRACKED_POLL_INTERVAL_CHANGED_EVENT, syncGlobalPollInterval);
    return () => {
      window.removeEventListener(CLAUDE_PREFERENCES_CHANGED_EVENT, syncClaudePreferences);
      window.removeEventListener(TRACKED_POLL_INTERVAL_CHANGED_EVENT, syncGlobalPollInterval);
    };
  }, []);

  const guardrailsActive = claudePreferences.fiveHour.enabled || claudePreferences.weekly.enabled;
  const effectivePollIntervalSecs = claudeAccountMonitorPollIntervalSecs(
    guardrailsActive,
    isClaudeTracked,
    claudePreferences.pollIntervalSecs,
    globalPollIntervalSecs,
    idlePollIntervalSecs,
  );
  const accountMonitor = useClaudeAccountMonitor(
    showToast,
    platformVisible,
    guardrailsActive,
    effectivePollIntervalSecs,
    idlePollIntervalSecs,
    trackedClaudeAccountId,
  );

  const sharedRuntimePollIntervalSecs =
    platformVisible && trackedProvider === "claude" && guardrailsActive
      ? claudePreferences.pollIntervalSecs
      : globalPollIntervalSecs;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void invoke("set_poll_interval", {
        seconds: sharedRuntimePollIntervalSecs,
      }).catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sharedRuntimePollIntervalSecs]);

  useEffect(() => {
    void invoke("set_claude_features_enabled", { enabled: platformVisible }).catch(() => {});
  }, [platformVisible]);

  useEffect(() => {
    if (!platformVisible) return;
    let cancelled = false;
    invoke<ClaudeMonitorStatus>("ensure_claude_statusline_bridge")
      .then((status) => {
        if (!cancelled) setClaudeMonitorStatus(status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [guardrailsActive, platformVisible]);

  return {
    claudeMonitorStatus,
    claudePollIntervalSecs: claudePreferences.pollIntervalSecs,
    claudeStopThresholdPct: claudePreferences.fiveHour.thresholdPct,
    claudeAutoStopArmed: guardrailsActive,
    claudeGuardrailsEnabled: guardrailsActive,
    handleClaudePollIntervalChange,
    handleClaudeStopThresholdChange,
    ...accountMonitor,
  };
}
