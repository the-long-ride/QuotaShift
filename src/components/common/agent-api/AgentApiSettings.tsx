import React, { useState } from "react";
import { AgentApiConfigureIcon, AgentApiIcon } from "./AgentApiIcons";
import { AgentApiModal } from "./AgentApiModal";

export const AgentApiSettings: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="settings-action-row settings-toggle-row agent-api-entry"
        onClick={() => setOpen(true)} data-tooltip="Configure the local Agent API and supported agent skills">
        <span className="settings-row-icon"><AgentApiIcon size={13} /></span>
        <span className="settings-toggle-copy">
          <span className="settings-toggle-label">AI Agent API</span>
          <span className="settings-toggle-description">
            Configure a separate authenticated local API for quota access and account rotation.
          </span>
        </span>
        <span className="agent-api-configure"><AgentApiConfigureIcon /> Configure</span>
      </button>
      {open && <AgentApiModal onClose={() => setOpen(false)} />}
    </>
  );
};
