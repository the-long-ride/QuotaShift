import React, { useState } from "react";
import {
  AgentApiCopyIcon,
  AgentApiEyeIcon,
  AgentApiRotateIcon,
  AgentApiSaveIcon,
} from "./AgentApiIcons";

interface AgentApiKeySectionProps {
  busy: boolean;
  running: boolean;
  keyConfigured: boolean;
  manualKey: string;
  revealedKey: string | null;
  onChange: (value: string) => void;
  onCopy: (value: string) => void;
  onRotate: () => void;
  onSave: () => void;
}

export const AgentApiKeySection: React.FC<AgentApiKeySectionProps> = ({
  busy,
  running,
  keyConfigured,
  manualKey,
  revealedKey,
  onChange,
  onCopy,
  onRotate,
  onSave,
}) => {
  const [showKey, setShowKey] = useState(false);
  const displayValue = manualKey || revealedKey || "";
  const canCopy = Boolean(displayValue);
  const canSave = !busy && !running && manualKey.trim().length >= 16;

  return (
    <section className="agent-api-section" aria-labelledby="agent-api-key-section">
      <h3 id="agent-api-key-section">API Key</h3>
      <p>
        {revealedKey && !manualKey
          ? "New key saved to OS keyring. Copy it now: it will not be shown again."
          : "Enter 16+ characters to save a custom key while stopped, or rotate to generate one."}
      </p>
      <div className="agent-api-key-row">
        <input
          id="agent-api-manual-key-input"
          className="form-input"
          aria-label="API Key"
          type={showKey ? "text" : "password"}
          placeholder={
            keyConfigured
              ? "Saved in OS keyring — enter a new key to replace"
              : "Enter custom API key (min 16 characters)"
          }
          value={displayValue}
          disabled={busy || (running && !revealedKey)}
          readOnly={Boolean(revealedKey && !manualKey)}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="dialog-btn dialog-btn--secondary agent-api-icon-btn"
          disabled={busy || (!displayValue && running)}
          onClick={() => setShowKey((value) => !value)}
          aria-label={showKey ? "Hide API key" : "Show API key"}
          data-tooltip={showKey ? "Hide API key" : "Show API key"}
        >
          <AgentApiEyeIcon hidden={showKey} />
        </button>
        <button
          type="button"
          className="dialog-btn dialog-btn--secondary agent-api-icon-btn"
          disabled={busy || !canCopy}
          onClick={() => onCopy(displayValue)}
          aria-label="Copy API key"
          data-tooltip="Copy API key"
        >
          <AgentApiCopyIcon />
        </button>
        <button
          type="button"
          className={`dialog-btn ${keyConfigured ? "dialog-btn--secondary" : "agent-api-primary"} agent-api-icon-btn`}
          disabled={busy || running}
          onClick={onRotate}
          aria-label={keyConfigured ? "Rotate API key" : "Generate API key"}
          data-tooltip={keyConfigured ? "Rotate API key" : "Generate API key"}
        >
          <AgentApiRotateIcon />
        </button>
        <button
          type="button"
          className="dialog-btn dialog-btn--secondary agent-api-icon-btn"
          disabled={!canSave}
          onClick={onSave}
          aria-label="Save custom API key"
          data-tooltip="Save custom API key"
        >
          <AgentApiSaveIcon />
        </button>
      </div>
    </section>
  );
};
