import React from "react";

interface AntigravityEmptyStateProps {
  totalAccounts?: number;
  searchQuery?: string;
}

export const AntigravityEmptyState: React.FC<AntigravityEmptyStateProps> = ({
  totalAccounts = 0,
  searchQuery,
}) => {
  if (totalAccounts > 0) {
    return (
      <div className="codex-empty-state" style={{ margin: "16px auto", textAlign: "center" }}>
        <p className="codex-empty-title">No matching accounts</p>
        <p className="codex-empty-sub">
          {searchQuery?.trim()
            ? `No accounts found matching "${searchQuery.trim()}"`
            : "No accounts match the selected filter"}
        </p>
      </div>
    );
  }

  return (
    <div className="codex-empty-state">
      <div className="codex-empty-icon">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <path d="M9 9l6 3-6 3V9z" fill="currentColor" opacity="0.4" />
        </svg>
      </div>
      <p className="codex-empty-title">No Antigravity accounts</p>
      <p className="codex-empty-sub">
        Click <strong>Add Account</strong> to connect via Browser Login
        <br />
        or capture the active local session
      </p>
    </div>
  );
};
