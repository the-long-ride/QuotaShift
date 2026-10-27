import React from "react";

export const CodexModalHeaderIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    width="14"
    height="14"
    style={{ color: "var(--codex-accent)" }}
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9 9l6 3-6 3V9z" fill="currentColor" />
  </svg>
);

interface CodexModalTabsProps {
  activeTab: "apikey" | "browser" | "local";
  onTabSwitch: (tab: "apikey" | "browser" | "local") => void;
}

export const CodexModalTabs: React.FC<CodexModalTabsProps> = ({ activeTab, onTabSwitch }) => (
  <div className="modal-tab-bar">
    <button
      className={`modal-tab ${activeTab === "browser" ? "modal-tab--active" : ""}`}
      onClick={() => onTabSwitch("browser")}
      data-tooltip="Log in via browser to connect Codex account"
    >
      <svg viewBox="0 0 24 24" fill="none" width="9" height="9">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
      Browser Login
    </button>
    <button
      className={`modal-tab ${activeTab === "apikey" ? "modal-tab--active" : ""}`}
      onClick={() => onTabSwitch("apikey")}
      data-tooltip="Use an OpenAI API Key to connect Codex account"
    >
      <svg viewBox="0 0 24 24" fill="none" width="9" height="9">
        <path
          d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      API Key
    </button>
    <button
      className={`modal-tab ${activeTab === "local" ? "modal-tab--active" : ""}`}
      onClick={() => onTabSwitch("local")}
      data-tooltip="Import Codex CLI local auth file session"
    >
      <svg viewBox="0 0 24 24" fill="none" width="9" height="9">
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" />
      </svg>
      Local Session
    </button>
  </div>
);
