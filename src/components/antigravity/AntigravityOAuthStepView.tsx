import React from "react";

interface AntigravityOAuthStepViewProps {
  oauthStep: 1 | 2 | 3;
  oauthLoading: boolean;
  oauthStatusText: string;
  oauthStatusType: "normal" | "error" | "success";
  handleStartBrowserLogin: () => void;
  handleCopyLoginLink: () => void;
  handleResetSession: (e: React.MouseEvent) => void;
}

export const AntigravityOAuthStepView: React.FC<AntigravityOAuthStepViewProps> = ({
  oauthStep,
  oauthLoading,
  oauthStatusText,
  oauthStatusType,
  handleStartBrowserLogin,
  handleCopyLoginLink,
  handleResetSession,
}) => {
  return (
    <div>
      <ol className="oauth-steps">
        <li
          className={`oauth-step ${oauthStep === 1 ? "oauth-step--active" : oauthStep > 1 ? "oauth-step--done" : ""}`}
        >
          <div className="oauth-step-num">1</div>
          <div className="oauth-step-body">
            <p className="oauth-step-title">Sign in with Google</p>
            <p className="oauth-step-desc">
              Grants cloud-platform scope needed for quota API. Tokens are also written back to
              your Antigravity IDE session.
            </p>
            <div
              style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}
            >
              <button
                className={`oauth-open-btn ${oauthStep > 1 ? "oauth-open-btn--done" : ""} ${oauthLoading && oauthStep === 1 ? "loading" : ""}`}
                onClick={handleStartBrowserLogin}
                disabled={oauthStep > 1 || oauthLoading}
              >
                {oauthStep > 1 ? (
                  "Login page opened"
                ) : (
                  <>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      width="11"
                      height="11"
                    >
                      <path
                        d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M15 3h6v6"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <line
                        x1="10"
                        y1="14"
                        x2="21"
                        y2="3"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                    Sign in with Google
                  </>
                )}
              </button>
              {oauthStep === 1 && (
                <button
                  className="oauth-copy-btn"
                  onClick={handleCopyLoginLink}
                  disabled={oauthLoading}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    width="11"
                    height="11"
                  >
                    <path
                      d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V8a2 2 0 00-2-2h-4M8 4a2 2 0 012-2h3m-5 4H5a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2v-2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Copy Link
                </button>
              )}
            </div>
          </div>
        </li>
        <li
          className={`oauth-step ${oauthStep === 2 ? "oauth-step--active" : oauthStep > 2 ? "oauth-step--done" : ""}`}
        >
          <div className="oauth-step-num">2</div>
          <div className="oauth-step-body">
            <p className="oauth-step-title">Complete Login in Browser</p>
            <p className="oauth-step-desc">
              Authenticate with your Google account. The page will redirect back automatically.
            </p>
          </div>
        </li>
        <li className={`oauth-step ${oauthStep === 3 ? "oauth-step--active" : ""}`}>
          <div className="oauth-step-num">3</div>
          <div className="oauth-step-body">
            <p className="oauth-step-title">Connected!</p>
            <p className="oauth-step-desc">
              Your Antigravity account is connected. Tokens are written to the IDE session
              stores.
            </p>
          </div>
        </li>
      </ol>

      {oauthStatusText && (
        <div
          className={`oauth-validate-row ${oauthStatusType === "error" ? "oauth-validate-row--error" : oauthStatusType === "success" ? "oauth-validate-row--success" : ""}`}
        >
          {oauthLoading && <div className="oauth-spinner" />}
          <span className="oauth-validate-text">
            {oauthStatusText.includes("bind to port 1456") ? (
              <>
                {oauthStatusText}{" "}
                <a
                  href="#"
                  onClick={handleResetSession}
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