import React from "react";

export interface AntigravityModalTabsProps {
  activeTab: "browser" | "capture";
  onTabSwitch: (tab: "browser" | "capture") => void;
}

export const AntigravityModalTabs: React.FC<AntigravityModalTabsProps> = ({
  activeTab,
  onTabSwitch,
}) => {
  return (
    <div className="modal-tab-bar">
      <button
        type="button"
        className={`modal-tab ${activeTab === "browser" ? "modal-tab--active" : ""}`}
        onClick={() => onTabSwitch("browser")}
        data-tooltip="Browser Login"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width="9"
          height="9"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 014-10z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
        Browser Login
      </button>
      <button
        type="button"
        className={`modal-tab ${activeTab === "capture" ? "modal-tab--active" : ""}`}
        onClick={() => onTabSwitch("capture")}
        data-tooltip="Capture Session"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width="9"
          height="9"
        >
          <path
            d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        Capture Session
      </button>
    </div>
  );
};

export const AntigravityModalHeaderIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    style={{ color: "var(--accent-white)" }}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9 17V7l7 5-7 5z" fill="currentColor" />
  </svg>
);
