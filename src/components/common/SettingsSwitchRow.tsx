import React from "react";

export const SettingsSwitchRow: React.FC<{
  icon: React.ReactNode;
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onToggle: () => void;
}> = ({ icon, label, description, checked, onToggle }) => (
  <button
    type="button"
    className="settings-toggle-row"
    onClick={onToggle}
    data-tooltip={
      typeof label === "string"
        ? `${checked ? "Disable" : "Enable"} ${label}`
        : checked
          ? "Turn off"
          : "Turn on"
    }
  >
    <span className="settings-row-icon">{icon}</span>
    <span className="settings-toggle-copy">
      <span className="settings-toggle-label">{label}</span>
      {description && <span className="settings-toggle-description">{description}</span>}
    </span>
    <span
      className={`codex-pool-switch ${checked ? "codex-pool-switch--on" : ""}`}
      role="switch"
      aria-checked={checked}
    >
      <span className="codex-pool-switch-thumb" />
    </span>
  </button>
);
