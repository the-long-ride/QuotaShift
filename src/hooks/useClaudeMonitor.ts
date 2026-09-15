import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ClaudeMonitorStatus } from "../utils/common/types";
import type { ToastKind } from "../components/common/Toast";
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

type ShowToast = (message: string, kind?: ToastKind) => void;

type ClaudeProcessKillResult = {
  totalKilled: number;
  ideBackendKilled?: boolean;
  ideBackendRestarted?: boolean;
};

const TRACKED_PROVIDER_KEY = "quotashift_overlay_tracked_provider";

const emptyStatus: ClaudeMonitorStatus = {
  installed: false,
  settingsPath: null,
  source: "none",
  session: null,
  localUsage: null,
  error: null,
};

export function useClaudeMonitor(showToast: ShowToast) {
  const [claudeMonitorStatus, setClaudeMonitorStatus] =
    useState<ClaudeMonitorStatus>(emptyStatus);
  const [claudePreferences, setClaudePreferences] = useState(() => loadClaudePreferences());
  const [globalPollIntervalSecs, setGlobalPollIntervalSecs] = useState(() =>
    loadTrackedPollIntervalPreference(),
  );
  const preferencesRef = useRef(claudePreferences);
  preferencesRef.current = claudePreferences;
  const lastKillAtRef = useRef(0);
  const trackedProvider =
    typeof window === "undefined" ? null : window.localStorage.getItem(TRACKED_PROVIDER_KEY);

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
    const syncClaudePreferences = () => {
      const next = normalizeClaudePreferences(loadClaudePreferences());
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

  const maybeAutoStopClaude = useCallback(
    async (status: ClaudeMonitorStatus) => {
      const preferences = normalizeClaudePreferences(loadClaudePreferences());
      preferencesRef.current = preferences;
      if (!preferences.fiveHour.enabled && !preferences.weekly.enabled) return;

      const five = status.session?.fiveHour?.usedPercentage;
      const seven = status.session?.sevenDay?.usedPercentage;
      const fiveHit =
        preferences.fiveHour.enabled &&
        typeof five === "number" &&
        five >= preferences.fiveHour.thresholdPct;
      const weeklyHit =
        preferences.weekly.enabled &&
        typeof seven === "number" &&
        seven >= preferences.weekly.thresholdPct;
      if (!fiveHit && !weeklyHit) return;

      const now = Date.now();
      if (now - lastKillAtRef.current < 60_000) return;
      lastKillAtRef.current = now;

      const windowLabel = fiveHit && weeklyHit ? "5-hour / weekly" : fiveHit ? "5-hour" : "weekly";
      const threshold = fiveHit
        ? preferences.fiveHour.thresholdPct
        : preferences.weekly.thresholdPct;

      try {
        const result = await invoke<ClaudeProcessKillResult>("kill_claude_processes");
        const killed = result?.totalKilled ?? 0;
        if (killed > 0) {
          const ideNote = result.ideBackendRestarted
            ? " · Claude IDE backend restarted without closing the IDE"
            : result.ideBackendKilled
              ? " · Claude IDE backend stopped; IDE left open"
              : "";
          showToast(
            `Claude stopped at ${threshold}% ${windowLabel} usage (${killed} process(es) terminated)${ideNote}`,
            "info",
          );
        }
      } catch (err) {
        showToast(`Failed to stop Claude at threshold: ${String(err)}`, "error");
      }
    },
    [showToast],
  );

  const guardrailsActive = claudePreferences.fiveHour.enabled || claudePreferences.weekly.enabled;
  const effectivePollIntervalSecs = guardrailsActive
    ? claudePreferences.pollIntervalSecs
    : globalPollIntervalSecs;
  const sharedRuntimePollIntervalSecs =
    trackedProvider === "claude" && guardrailsActive
      ? claudePreferences.pollIntervalSecs
      : globalPollIntervalSecs;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void invoke("set_poll_interval", {
        seconds: BigInt(sharedRuntimePollIntervalSecs),
      }).catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sharedRuntimePollIntervalSecs, globalPollIntervalSecs, trackedProvider]);

  useEffect(() => {
    let cancelled = false;
    invoke<ClaudeMonitorStatus>("ensure_claude_statusline_bridge")
      .then((status) => {
        if (!cancelled) {
          setClaudeMonitorStatus(status);
          void maybeAutoStopClaude(status);
        }
      })
      .catch(() => {});

    const tick = async () => {
      try {
        const status = await invoke<ClaudeMonitorStatus>("get_claude_monitor_status");
        if (!cancelled) {
          setClaudeMonitorStatus(status);
          void maybeAutoStopClaude(status);
        }
      } catch {}
    };

    const ms = Math.max(5, effectivePollIntervalSecs) * 1000;
    const timer = setInterval(tick, ms);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [effectivePollIntervalSecs, maybeAutoStopClaude]);

  const claudeAutoStopArmed = guardrailsActive;

  return {
    claudeMonitorStatus,
    claudePollIntervalSecs: claudePreferences.pollIntervalSecs,
    claudeStopThresholdPct: claudePreferences.fiveHour.thresholdPct,
    claudeAutoStopArmed,
    claudeGuardrailsEnabled: guardrailsActive,
    handleClaudePollIntervalChange,
    handleClaudeStopThresholdChange,
  };
}
