import React, { useState, useRef, useEffect } from "react";

interface PassphraseModalProps {
  mode: "create" | "unlock" | "export" | "import" | "migrate";
  onSubmit: (passphrase: string) => void;
  onCancel?: () => void;
  error?: string;
}

export const PassphraseModal: React.FC<PassphraseModalProps> = ({
  mode,
  onSubmit,
  onCancel,
  error,
}) => {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [localError, setLocalError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!passphrase) {
      setLocalError("Passphrase cannot be empty.");
      return;
    }

    if (mode === "create" || mode === "export") {
      if (passphrase.length < 4) {
        setLocalError("Passphrase must be at least 4 characters.");
        return;
      }
      if (passphrase !== confirmPassphrase) {
        setLocalError("Passphrases do not match.");
        return;
      }
    }

    setLocalError("");
    onSubmit(passphrase);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const displayError = error || localError;

  let title = "Unlock QuotaShift";
  let description = "Enter your passphrase to decrypt and access your stored data.";
  let submitLabel = "Unlock";

  if (mode === "create") {
    title = "Set Encryption Passphrase";
    description = "Create a passphrase to encrypt your stored accounts and tokens. You'll need this passphrase to decrypt/import or encrypt/export backups.";
    submitLabel = "Set Passphrase";
  } else if (mode === "export") {
    title = "Encrypt Export Backup";
    description = "Create a passphrase to encrypt your exported backup file. You will need this passphrase to decrypt and import this backup later.";
    submitLabel = "Export Backup";
  } else if (mode === "import") {
    title = "Decrypt Import Backup";
    description = "Enter the passphrase that was used to encrypt this backup file.";
    submitLabel = "Decrypt & Import";
  } else if (mode === "migrate") {
    title = "Migrate to Plaintext Storage";
    description = "Enter your current passphrase to decrypt your database. Your credentials will be saved in plaintext local storage, and you will not be prompted for a passphrase on startup anymore.";
    submitLabel = "Decrypt & Migrate";
  }

  return (
    <div className="dialog-overlay" style={{ display: "flex" }}>
      <div className="dialog-box" style={{ minHeight: "auto", textAlign: "left" }}>
        {/* Header */}
        <div className="dialog-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{title}</span>
        </div>

        {/* Description */}
        <p style={{
          fontSize: "10px",
          color: "var(--text-secondary)",
          marginBottom: "14px",
          lineHeight: "1.5",
        }}>
          {description}
        </p>

        {/* Passphrase field */}
        <div className="form-field" style={{ marginBottom: "10px" }}>
          <label className="form-label" htmlFor="passphrase-input">
            Passphrase
          </label>
          <div className="password-input-wrap">
            <input
              ref={inputRef}
              type={showPass ? "text" : "password"}
              id="passphrase-input"
              className="form-input"
              placeholder="Enter passphrase..."
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPass(!showPass)}
              tabIndex={-1}
              data-tooltip={showPass ? "Hide passphrase" : "Show passphrase"}
            >
              {showPass ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Confirm passphrase (create and export modes) */}
        {(mode === "create" || mode === "export") && (
          <div className="form-field" style={{ marginBottom: "10px" }}>
            <label className="form-label" htmlFor="confirm-passphrase-input">
              Confirm Passphrase
            </label>
            <div className="password-input-wrap">
              <input
                type={showConfirm ? "text" : "password"}
                id="confirm-passphrase-input"
                className="form-input"
                placeholder="Re-enter passphrase..."
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirm(!showConfirm)}
                tabIndex={-1}
                data-tooltip={showConfirm ? "Hide passphrase" : "Show passphrase"}
              >
                {showConfirm ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {displayError && (
          <p style={{
            fontSize: "10px",
            color: "#ff5252",
            marginBottom: "10px",
            lineHeight: "1.4",
          }}>
            {displayError}
          </p>
        )}

        {/* Actions */}
        <div className="dialog-buttons" style={{ marginTop: "12px", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          {onCancel && (
            <button className="dialog-btn dialog-btn--cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="dialog-btn" onClick={handleSubmit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
