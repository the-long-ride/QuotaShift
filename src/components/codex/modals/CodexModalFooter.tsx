import React from "react";

interface CodexModalFooterProps {
  activeTab: "apikey" | "browser" | "local";
  onClose: () => void;
  onConnectApiKey: () => void;
  onLocalImport: () => void;
}

export const CodexModalFooter: React.FC<CodexModalFooterProps> = ({
  activeTab,
  onClose,
  onConnectApiKey,
  onLocalImport,
}) => {
  if (activeTab === "apikey") {
    return (
      <>
        <button
          className="dialog-btn dialog-btn--cancel"
          onClick={onClose}
          data-tooltip="Cancel adding Codex account and close dialog"
        >
          Cancel
        </button>
        <button
          className="dialog-btn"
          onClick={onConnectApiKey}
          data-tooltip="Validate key and connect the account"
        >
          Connect
        </button>
      </>
    );
  }
  if (activeTab === "browser") {
    return (
      <button
        className="dialog-btn dialog-btn--cancel"
        onClick={onClose}
        data-tooltip="Cancel the browser login flow"
      >
        Cancel
      </button>
    );
  }
  if (activeTab === "local") {
    return (
      <>
        <button
          className="dialog-btn dialog-btn--cancel"
          onClick={onClose}
          data-tooltip="Cancel importing local session"
        >
          Cancel
        </button>
        <button
          className="dialog-btn"
          onClick={onLocalImport}
          data-tooltip="Search and import active session from local files"
        >
          Import Session
        </button>
      </>
    );
  }
  return null;
};
