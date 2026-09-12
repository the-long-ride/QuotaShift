import React from "react";

interface CodexBrowserLoginTabProps {
  oauthStep: 1 | 2 | 3;
  oauthLoading: boolean;
  oauthStatusText: string;
  oauthStatusType: "normal" | "error" | "success";
  onStartBrowserLogin: () => void;
  onCopyLoginLink: () => void;
  onResetSession: (e: React.MouseEvent) => void;
}

export const CodexBrowserLoginTab: React.FC<CodexBrowserLoginTabProps> = ({
  oauthStep,
  oauthLoading,
  oauthStatusText,
  oauthStatusType,
  onStartBrowserLogin,
  onCopyLoginLink,
  onResetSession,
}) => {
  return (
    <div>
      <ol className="oauth-steps">
        <li className={`oauth-step ${oauthStep === 1 ? "oauth-step--active" : oauthStep > 1 ? "oauth-step--done" : ""}`}>
          <div className="oauth-step-num">1</div>
          <div className="oauth-step-body">
            <p className="oauth-step-title">Start Login</p>
            <p className="oauth-step-desc">Click below to start ChatGPT login via your default browser.</p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                className={`oauth-open-btn ${oauthStep > 1 ? "oauth-open-btn--done" : ""} ${oauthLoading && oauthStep === 1 ? "loading" : ""}`}
                onClick={onStartBrowserLogin}
                disabled={oauthStep > 1 || oauthLoading}
                data-tooltip="Open ChatGPT.com login page in your browser"
              >
                {oauthStep > 1 ? (
                  "✓ Login page opened in browser"
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="11" height="11">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <path d="M15 3h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    Log in with ChatGPT.com
                  </>
                )}
              </button>
              {oauthStep === 1 && (
                <button
                  className="oauth-copy-btn"
                  onClick={onCopyLoginLink}
                  disabled={oauthLoading}
                  data-tooltip="Copy the ChatGPT.com login link to clipboard"
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="11" height="11">
                    <path d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V8a2 2 0 00-2-2h-4M8 4a2 2 0 012-2h3m-5 4H5a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Copy Link
                </button>
              )}
            </div>
          </div>
        </li>
        <li className={`oauth-step ${oauthStep === 2 ? "oauth-step--active" : oauthStep > 2 ? "oauth-step--done" : ""}`}>
          <div className="oauth-step-num">2</div>
          <div className="oauth-step-body">
            <p className="oauth-step-title">Complete Login in Browser</p>
            <p className="oauth-step-desc">
              Authenticate on the OpenAI page. When finished, it will automatically redirect back.
            </p>
          </div>
        </li>
        <li className={`oauth-step ${oauthStep === 3 ? "oauth-step--active" : ""}`}>
          <div className="oauth-step-num">3</div>
          <div className="oauth-step-body">
            <p className="oauth-step-title">Success!</p>
            <p className="oauth-step-desc">Your ChatGPT workspaces are connected successfully.</p>
          </div>
        </li>
      </ol>

      {oauthStatusText && (
        <div className={`oauth-validate-row ${oauthStatusType === "error" ? "oauth-validate-row--error" : oauthStatusType === "success" ? "oauth-validate-row--success" : ""}`}>
          {oauthLoading && <div className="oauth-spinner" />}
          <span className="oauth-validate-text">
            {oauthStatusText.includes("bind to port 1455") ? (
              <>
                {oauthStatusText}{" "}
                <a
                  href="#"
                  onClick={onResetSession}
                  style={{
                    color: "var(--text-primary)",
                    textDecoration: "underline",
                    marginLeft: "6px",
                    fontWeight: 600,
                  }}
                >
                  Reset Session
                </a>
              </>
            ) : (
              oauthStatusText
            )}
          </span>
        </div>
      )}
    </div>
  );
};