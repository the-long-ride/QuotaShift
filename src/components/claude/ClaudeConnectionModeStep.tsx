import React from "react";
import type { ConnectionMode } from "../../hooks/claude/useClaudeCodePoolConnector";

export interface ClaudeConnectionModeStepProps {
  mode: ConnectionMode;
  onChange: (mode: ConnectionMode) => void;
}

export const ClaudeConnectionModeStep: React.FC<ClaudeConnectionModeStepProps> = ({
  mode,
  onChange,
}) => (
  <section className="claude-wizard-section" aria-label="Choose connection mode">
    <div className="claude-wizard-section-heading">Choose connection mode</div>
    <div className="claude-wizard-mode-list">
      <label
        className={`claude-wizard-mode${mode === "launch-once" ? " claude-wizard-mode--selected" : ""}`}
      >
        <input
          type="radio"
          name="claude-connection-mode"
          checked={mode === "launch-once"}
          onChange={() => onChange("launch-once")}
        />
        <span>
          <strong>Launch once</strong>
          <small>
            Open an isolated CLI session without changing profile settings. Connecting again
            replaces the token of an earlier launch-once session for this profile.
          </small>
        </span>
      </label>
      <label
        className={`claude-wizard-mode${mode === "persistent-profile" ? " claude-wizard-mode--selected" : ""}`}
      >
        <input
          type="radio"
          name="claude-connection-mode"
          checked={mode === "persistent-profile"}
          onChange={() => onChange("persistent-profile")}
        />
        <span>
          <strong>Persist for this profile</strong>
          <small>
            Writes ANTHROPIC_BASE_URL, the model env keys and an apiKeyHelper command into this
            profile&apos;s settings.json. No token is stored there. Disconnect undoes it. Remove any
            ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY from that file first. Needs a fixed router
            port (Model Pools &gt; Router Server &gt; Port, Apply).
          </small>
        </span>
      </label>
    </div>
  </section>
);
