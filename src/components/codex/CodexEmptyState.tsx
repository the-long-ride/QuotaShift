import React from "react";

export const CodexEmptyState: React.FC = () => {
  return (
    <div className="codex-empty-state">
      <div className="codex-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <path d="M9 9l6 3-6 3V9z" fill="currentColor" opacity="0.4" />
        </svg>
      </div>
      <p className="codex-empty-title">No Codex accounts</p>
      <p className="codex-empty-sub">
        Click <strong>Add Account</strong> to connect via API key<br />
        or use <strong>Browser Login</strong> for guided setup
      </p>
    </div>
  );
};
