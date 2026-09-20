import React, { useEffect, useState } from "react";
import {
  buildShortcutFromKeyEvent,
  DEFAULT_SHORTCUT_REFRESH_ACCOUNT,
  DEFAULT_SHORTCUT_TOGGLE_OVERLAY,
  formatShortcutDisplay,
  IN_APP_SHORTCUT_DEFAULTS,
  loadShortcutPreferences,
  saveShortcutPreferences,
  SHORTCUTS_CHANGED_EVENT,
  type InAppShortcutKey,
  type ShortcutBindingKey,
  type ShortcutPreferences,
} from "../../utils/common/shortcuts";
import { CardViewIcon, ShortcutOverlayIcon, ShortcutRefreshIcon } from "./SettingsIcons";
import {
  AddAccountIcon,
  FocusSearchIcon,
  GearIcon,
  QuitIcon,
  RefreshIcon,
  ShortcutThemeIcon,
} from "./HeaderIcons";

type GlobalShortcutKey = "toggleOverlay" | "refreshAccount";
type EnabledKey = "toggleOverlayEnabled" | "refreshAccountEnabled";

const GLOBAL_SHORTCUTS: Array<{
  key: GlobalShortcutKey;
  enabledKey: EnabledKey;
  label: string;
  description: string;
  defaultValue: string;
  icon: React.ReactNode;
}> = [
  {
    key: "toggleOverlay",
    enabledKey: "toggleOverlayEnabled",
    label: "Toggle Overlay",
    description: "Show or hide the desktop overlay from anywhere.",
    defaultValue: DEFAULT_SHORTCUT_TOGGLE_OVERLAY,
    icon: <ShortcutOverlayIcon />,
  },
  {
    key: "refreshAccount",
    enabledKey: "refreshAccountEnabled",
    label: "Refresh Usage",
    description: "Refresh the monitored account even while QuotaShift is in the tray.",
    defaultValue: DEFAULT_SHORTCUT_REFRESH_ACCOUNT,
    icon: <ShortcutRefreshIcon />,
  },
];

const IN_APP_SHORTCUTS: Array<{
  key: InAppShortcutKey;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: "addAccount",
    label: "Add account",
    description: "Add an account for the current tab.",
    icon: <AddAccountIcon />,
  },
  {
    key: "toggleTheme",
    label: "Toggle theme",
    description: "Switch between dark and light mode.",
    icon: <ShortcutThemeIcon />,
  },
  {
    key: "toggleCardView",
    label: "Toggle card view",
    description: "Switch between compact and expanded cards.",
    icon: <CardViewIcon />,
  },
  {
    key: "focusSearch",
    label: "Focus search",
    description: "Focus the account search field.",
    icon: <FocusSearchIcon />,
  },
  {
    key: "refreshAll",
    label: "Reload full usage",
    description: "Refresh usage for all accounts.",
    icon: <RefreshIcon />,
  },
  {
    key: "openSettings",
    label: "Open settings",
    description: "Open the Settings dialog.",
    icon: <GearIcon />,
  },
  {
    key: "quitApp",
    label: "Quit app",
    description: "Open the quit confirmation dialog.",
    icon: <QuitIcon />,
  },
];

const ResetIcon: React.FC = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

export const ShortcutSettings: React.FC = () => {
  const [prefs, setPrefs] = useState<ShortcutPreferences>(loadShortcutPreferences);
  const [recordingKey, setRecordingKey] = useState<ShortcutBindingKey | null>(null);

  useEffect(() => {
    const sync = () => setPrefs(loadShortcutPreferences());
    window.addEventListener(SHORTCUTS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(SHORTCUTS_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!recordingKey) {
      delete document.documentElement.dataset.shortcutRecording;
      return;
    }

    document.documentElement.dataset.shortcutRecording = "true";
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecordingKey(null);
        return;
      }

      const shortcut = buildShortcutFromKeyEvent(event);
      if (!shortcut) return;

      saveShortcutPreferences({ [recordingKey]: shortcut } as Partial<ShortcutPreferences>);
      setRecordingKey(null);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      delete document.documentElement.dataset.shortcutRecording;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [recordingKey]);

  const startRecording = (key: ShortcutBindingKey) =>
    setRecordingKey((current) => (current === key ? null : key));

  const resetBinding = (key: ShortcutBindingKey, defaultValue: string) => {
    saveShortcutPreferences({ [key]: defaultValue } as Partial<ShortcutPreferences>);
    if (recordingKey === key) setRecordingKey(null);
  };

  const toggleGlobalEnabled = (key: GlobalShortcutKey, enabledKey: EnabledKey) => {
    if (recordingKey === key) setRecordingKey(null);
    saveShortcutPreferences({ [enabledKey]: !prefs[enabledKey] });
  };

  const renderBindingButton = (
    key: ShortcutBindingKey,
    currentValue: string,
    defaultValue: string,
    enabled = true,
  ) => (
    <div className="settings-shortcut-controls">
      <button
        type="button"
        className={`settings-shortcut-badge ${recordingKey === key ? "settings-shortcut-badge--recording" : ""}`}
        onClick={() => enabled && startRecording(key)}
        disabled={!enabled}
        data-tooltip={enabled ? "Click to record a new shortcut" : "Shortcut disabled"}
      >
        {recordingKey === key ? "Press keys..." : formatShortcutDisplay(currentValue)}
      </button>
      {enabled && currentValue !== defaultValue && (
        <button
          type="button"
          className="settings-shortcut-reset"
          onClick={() => resetBinding(key, defaultValue)}
          data-tooltip="Reset to default"
          aria-label={`Reset ${key} shortcut`}
        >
          <ResetIcon />
        </button>
      )}
    </div>
  );

  return (
    <div className="settings-section">
      <div className="settings-section-title">Keyboard Shortcuts</div>

      <div className="settings-shortcut-group">
        <div className="settings-shortcut-group-title">Global shortcuts</div>
        <div className="settings-shortcut-group-description">
          Work system-wide, including while QuotaShift is hidden in the tray.
        </div>
        {GLOBAL_SHORTCUTS.map(({ key, enabledKey, label, description, defaultValue, icon }) => {
          const enabled = prefs[enabledKey];
          return (
            <div
              key={key}
              className={`settings-toggle-row settings-toggle-row--segmented settings-shortcut-row ${!enabled ? "settings-shortcut-row--disabled" : ""}`}
            >
              <span className="settings-row-icon">{icon}</span>
              <div className="settings-toggle-copy settings-shortcut-info">
                <div className="settings-toggle-label settings-shortcut-label">{label}</div>
                <div className="settings-toggle-description settings-shortcut-hint">
                  {description}
                </div>
              </div>
              {renderBindingButton(key, prefs[key], defaultValue, enabled)}
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`${label} shortcut enabled`}
                data-tooltip={enabled ? "Disable shortcut" : "Enable shortcut"}
                className={`codex-pool-switch ${enabled ? "codex-pool-switch--on" : ""}`}
                onClick={() => toggleGlobalEnabled(key, enabledKey)}
              >
                <span className="codex-pool-switch-thumb" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="settings-shortcut-group">
        <div className="settings-shortcut-group-title">In app shortcuts</div>
        <div className="settings-shortcut-group-description">
          Work only while the QuotaShift window is open.
        </div>
        {IN_APP_SHORTCUTS.map(({ key, label, description, icon }) => (
          <div
            key={key}
            className="settings-toggle-row settings-toggle-row--segmented settings-shortcut-row"
          >
            <span className="settings-row-icon">{icon}</span>
            <div className="settings-toggle-copy settings-shortcut-info">
              <div className="settings-toggle-label settings-shortcut-label">{label}</div>
              <div className="settings-toggle-description settings-shortcut-hint">
                {description}
              </div>
            </div>
            {renderBindingButton(key, prefs[key], IN_APP_SHORTCUT_DEFAULTS[key])}
          </div>
        ))}
      </div>
    </div>
  );
};
