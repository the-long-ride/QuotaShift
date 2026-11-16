import React from "react";

/**
 * Local-only security notice banner displayed at the top of the Agent API modal.
 */
export const AgentApiSecurityBanner: React.FC = () => (
  <section className="agent-api-panel agent-api-intro" aria-label="Connection security">
    <strong>Local-only connection</strong>
    <p>
      Restricted to localhost (127.0.0.1). Disabled until enabled. Read operations return account
      IDs and quota information only, never email or account aliases.
    </p>
  </section>
);

interface AgentApiPortFieldProps {
  port: number;
  disabled: boolean;
  onChange: (port: number) => void;
}

/**
 * Port number input row for configuring the local loopback HTTP listener.
 */
export const AgentApiPortField: React.FC<AgentApiPortFieldProps> = ({
  port,
  disabled,
  onChange,
}) => (
  <div className="agent-api-setting">
    <label htmlFor="agent-api-port">
      <strong>Local API port</strong>
      <span>Available on this device only (1024–65535)</span>
    </label>
    <input
      id="agent-api-port"
      className="form-input agent-api-port"
      type="number"
      min={1024}
      max={65535}
      value={port}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </div>
);

interface AgentApiModalFooterProps {
  onClose: () => void;
}

/**
 * Footer close button bar for the Agent API settings modal.
 */
export const AgentApiModalFooter: React.FC<AgentApiModalFooterProps> = ({ onClose }) => (
  <div className="agent-api-footer">
    <button
      type="button"
      className="dialog-btn dialog-btn--secondary"
      data-tooltip="Close AI Agent API settings"
      onClick={onClose}
    >
      Close
    </button>
  </div>
);
