import React from "react";

interface CodexApiKeyTabProps {
  labelInputRef: React.RefObject<HTMLInputElement | null>;
  apiKeyLabel: string;
  setApiKeyLabel: (v: string) => void;
  apiKeyVal: string;
  setApiKeyVal: (v: string) => void;
  showApiKey: boolean;
  setShowApiKey: (v: boolean) => void;
  onConnect: () => void;
}

export const CodexApiKeyTab: React.FC<CodexApiKeyTabProps> = ({
  labelInputRef,
  apiKeyLabel,
  setApiKeyLabel,
  apiKeyVal,
  setApiKeyVal,
  showApiKey,
  setShowApiKey,
  onConnect,
}) => {
  return (
    <div>
      <div className="account-form">
        <div className="form-field">
          <label className="form-label" htmlFor="label-input">
            Account Label
          </label>
          <input
            ref={labelInputRef}
            type="text"
            id="label-input"
            className="form-input"
            placeholder="e.g. Work Account"
            maxLength={32}
            value={apiKeyLabel}
            onChange={(e) => setApiKeyLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onConnect();
              }
            }}
          />
        </div>

        <div className="form-field" style={{ marginTop: "16px" }}>
          <label className="form-label" htmlFor="api-key-input">
            API Key
          </label>
          <div className="password-input-wrap">
            <input
              type={showApiKey ? "text" : "password"}
              id="api-key-input"
              className="form-input"
              placeholder="sk-..."
              value={apiKeyVal}
              onChange={(e) => setApiKeyVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onConnect();
                }
              }}
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowApiKey(!showApiKey)}
              data-tooltip={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? (
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="11" height="11">
                  <path d="M2 12c4-8 16-8 20 0-4 8-16 8-20 0z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                  <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="11" height="11">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
          <p className="form-hint">Stored locally and never leaves your device.</p>
        </div>
      </div>
    </div>
  );
};
