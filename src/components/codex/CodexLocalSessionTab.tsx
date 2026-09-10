import React from "react";

interface CodexLocalSessionTabProps {
  localLabelRef: React.RefObject<HTMLInputElement | null>;
  localLabel: string;
  setLocalLabel: (v: string) => void;
  localErrorText: string | null;
  onImport: () => void;
}

export const CodexLocalSessionTab: React.FC<CodexLocalSessionTabProps> = ({
  localLabelRef,
  localLabel,
  setLocalLabel,
  localErrorText,
  onImport,
}) => {
  return (
    <div>
      <div className="account-form" style={{ padding: "4px 0 0" }}>
        <p className="oauth-step-desc" style={{ marginBottom: "12px" }}>
          Import the active session currently logged in via the Codex CLI (
          <code style={{ background: "var(--border-color)", padding: "2px 4px", borderRadius: "3px" }}>
            ~/.codex/auth.json
          </code>
          ).
        </p>
        <div className="form-field">
          <label className="form-label" htmlFor="local-label-input">
            Account Label
          </label>
          <input
            ref={localLabelRef}
            type="text"
            id="local-label-input"
            className="form-input"
            placeholder="e.g. Codex CLI"
            maxLength={32}
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onImport();
              }
            }}
          />
        </div>
      </div>

      {localErrorText && (
        <div
          style={{
            fontSize: "10.5px",
            marginBottom: "10px",
            padding: "6px",
            borderRadius: "4px",
            background: "rgba(220, 38, 38, 0.1)",
            border: "1px solid rgba(220, 38, 38, 0.2)",
            color: "#f87171",
            textAlign: "center",
          }}
        >
          {localErrorText}
        </div>
      )}
    </div>
  );
};
