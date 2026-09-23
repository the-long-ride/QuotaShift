import React from "react";
import { AccountCaptureLabelField } from "../common/AccountCaptureLabelField";

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
          <code
            style={{ background: "var(--border-color)", padding: "2px 4px", borderRadius: "3px" }}
          >
            ~/.codex/auth.json
          </code>
          ).
        </p>
        <AccountCaptureLabelField
          id="local-label-input"
          inputRef={localLabelRef}
          value={localLabel}
          onChange={setLocalLabel}
          onSubmit={onImport}
        />
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
