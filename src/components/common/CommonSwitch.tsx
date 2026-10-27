import React from "react";

export interface CommonSwitchProps {
  checked: boolean;
  onToggle: () => void;
  tooltip: string;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export const CommonSwitch: React.FC<CommonSwitchProps> = ({
  checked,
  onToggle,
  tooltip,
  ariaLabel,
  id,
  disabled = false,
  className = "",
}) => {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || tooltip}
      data-tooltip={tooltip}
      disabled={disabled}
      className={`codex-pool-switch ${checked ? "codex-pool-switch--on" : ""} ${className}`.trim()}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onToggle();
      }}
    >
      <span className="codex-pool-switch-thumb" />
    </button>
  );
};
