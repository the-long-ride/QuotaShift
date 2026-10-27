import React from "react";

export const SettingsSwitchRow: React.FC<{
  icon: React.ReactNode;
  label: React.ReactNode;
  /** Plain-text name for the tooltip when `label` is not a string. */
  tooltipLabel?: string;
  description?: React.ReactNode;
  checked: boolean;
  onToggle: () => void;
}> = ({ icon, label, tooltipLabel, description, checked, onToggle }) => (
  <button
    type="button"
    className="settings-toggle-row"
    onClick={onToggle}
    data-tooltip={
      (tooltipLabel ?? (typeof label === "string" ? label : null))
        ? `${checked ? "Disable" : "Enable"} ${tooltipLabel ?? label}`
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
