import React, { useState, useEffect } from "react";
import {
  loadShortcutPreferences,
  saveShortcutPreferences,
  formatShortcutDisplay,
  buildShortcutFromKeyEvent,
  DEFAULT_SHORTCUT_TOGGLE_OVERLAY,
  DEFAULT_SHORTCUT_REFRESH_ACCOUNT,
} from "../../utils/common/shortcuts";

export const ShortcutSettings: React.FC = () => {
  const [prefs, setPrefs] = useState(loadShortcutPreferences);
  const [recordingKey, setRecordingKey] = useState<"toggleOverlay" | "refreshAccount" | null>(null);

  useEffect(() => {
    const handleStorage = () => setPrefs(loadShortcutPreferences());
    window.addEventListener("quotashift_shortcuts_changed", handleStorage);
    return () => window.removeEventListener("quotashift_shortcuts_changed", handleStorage);
  }, []);

  useEffect(() => {
    if (!recordingKey) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecordingKey(null);
        return;
      }

      const shortcut = buildShortcutFromKeyEvent(e);
      if (shortcut) {
        const update = { [recordingKey]: shortcut };
        saveShortcutPreferences(update);
        setPrefs((prev) => ({ ...prev, ...update }));
        setRecordingKey(null);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingKey]);

  const handleReset = (field: "toggleOverlay" | "refreshAccount") => {
    const defaultVal =
      field === "toggleOverlay"
        ? DEFAULT_SHORTCUT_TOGGLE_OVERLAY
        : DEFAULT_SHORTCUT_REFRESH_ACCOUNT;
    const update = { [field]: defaultVal };
    saveShortcutPreferences(update);
    setPrefs((prev) => ({ ...prev, ...update }));
  };

  const handleToggleEnabled = (field: "toggleOverlay" | "refreshAccount") => {
    const enabledKey = field === "toggleOverlay" ? "toggleOverlayEnabled" : "refreshAccountEnabled";
    const nextEnabled = !prefs[enabledKey];
    if (recordingKey === field) {
      setRecordingKey(null);
    }
    const update = { [enabledKey]: nextEnabled };
    saveShortcutPreferences(update);
    setPrefs((prev) => ({ ...prev, ...update }));
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">Keyboard Shortcuts</div>

      {/* Toggle Overlay */}
      <div
        className={`settings-shortcut-row ${!prefs.toggleOverlayEnabled ? "settings-shortcut-row--disabled" : ""}`}
      >
        <div className="settings-shortcut-info">
          <div className="settings-shortcut-label">Toggle Overlay</div>
          <div className="settings-shortcut-hint">Show or hide the desktop overlay</div>
        </div>
        <div className="settings-shortcut-controls">
          <button
            type="button"
            className={`settings-shortcut-badge ${recordingKey === "toggleOverlay" ? "settings-shortcut-badge--recording" : ""}`}
            onClick={() => {
              if (!prefs.toggleOverlayEnabled) return;
              setRecordingKey(recordingKey === "toggleOverlay" ? null : "toggleOverlay");
            }}
            disabled={!prefs.toggleOverlayEnabled}
            title={
              prefs.toggleOverlayEnabled ? "Click to record a new shortcut" : "Shortcut disabled"
            }
          >
            {recordingKey === "toggleOverlay"
              ? "Press keys..."
              : formatShortcutDisplay(prefs.toggleOverlay)}
          </button>
          {prefs.toggleOverlay !== DEFAULT_SHORTCUT_TOGGLE_OVERLAY &&
            prefs.toggleOverlayEnabled && (
              <button
                type="button"
                className="settings-shortcut-reset"
                onClick={() => handleReset("toggleOverlay")}
                title="Reset to default"
                aria-label="Reset toggle overlay shortcut"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            )}
          <button
            type="button"
            role="switch"
            aria-checked={prefs.toggleOverlayEnabled}
            aria-label="Toggle Overlay shortcut enabled"
            title={prefs.toggleOverlayEnabled ? "Disable shortcut" : "Enable shortcut"}
            className={`codex-pool-switch ${prefs.toggleOverlayEnabled ? "codex-pool-switch--on" : ""}`}
            onClick={() => handleToggleEnabled("toggleOverlay")}
          >
            <span className="codex-pool-switch-thumb" />
          </button>
        </div>
      </div>

      {/* Refresh Current Account */}
      <div
        className={`settings-shortcut-row ${!prefs.refreshAccountEnabled ? "settings-shortcut-row--disabled" : ""}`}
      >
        <div className="settings-shortcut-info">
          <div className="settings-shortcut-label">Refresh Usage</div>
          <div className="settings-shortcut-hint">Refresh tracked account quota</div>
        </div>
        <div className="settings-shortcut-controls">
          <button
            type="button"
            className={`settings-shortcut-badge ${recordingKey === "refreshAccount" ? "settings-shortcut-badge--recording" : ""}`}
            onClick={() => {
              if (!prefs.refreshAccountEnabled) return;
              setRecordingKey(recordingKey === "refreshAccount" ? null : "refreshAccount");
            }}
            disabled={!prefs.refreshAccountEnabled}
            title={
              prefs.refreshAccountEnabled ? "Click to record a new shortcut" : "Shortcut disabled"
            }
          >
            {recordingKey === "refreshAccount"
              ? "Press keys..."
              : formatShortcutDisplay(prefs.refreshAccount)}
          </button>
          {prefs.refreshAccount !== DEFAULT_SHORTCUT_REFRESH_ACCOUNT &&
            prefs.refreshAccountEnabled && (
              <button
                type="button"
                className="settings-shortcut-reset"
                onClick={() => handleReset("refreshAccount")}
                title="Reset to default"
                aria-label="Reset refresh shortcut"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            )}
          <button
            type="button"
            role="switch"
            aria-checked={prefs.refreshAccountEnabled}
            aria-label="Refresh Usage shortcut enabled"
            title={prefs.refreshAccountEnabled ? "Disable shortcut" : "Enable shortcut"}
            className={`codex-pool-switch ${prefs.refreshAccountEnabled ? "codex-pool-switch--on" : ""}`}
            onClick={() => handleToggleEnabled("refreshAccount")}
          >
            <span className="codex-pool-switch-thumb" />
          </button>
        </div>
      </div>
    </div>
  );
};
