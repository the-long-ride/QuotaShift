import React, { useState, useRef, useEffect } from "react";

interface ChangePassphraseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (currentPass: string, newPass: string) => Promise<void>;
  hasCurrentPassphrase: boolean;
}

export const ChangePassphraseModal: React.FC<ChangePassphraseModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  hasCurrentPassphrase,
}) => {
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmNewPass, setConfirmNewPass] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setError("");
      setCurrentPass("");
      setNewPass("");
      setConfirmNewPass("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (hasCurrentPassphrase && !currentPass) {
      setError("Current passphrase is required.");
      return;
    }
    if (!newPass) {
      setError("New passphrase cannot be empty.");
      return;
    }
    if (newPass.length < 4) {
      setError("New passphrase must be at least 4 characters.");
      return;
    }
    if (newPass !== confirmNewPass) {
      setError("New passphrases do not match.");
      return;
    }
    if (hasCurrentPassphrase && newPass === currentPass) {
      setError("New passphrase must be different from current passphrase.");
      return;
    }

    setError("");
    setIsLoading(true);
    try {
      await onSubmit(currentPass, newPass);
      onClose();
    } catch (err: any) {
      const msg = err?.message || (typeof err === "string" ? err : String(err)) || "Failed to change passphrase.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="dialog-overlay" style={{ display: "flex" }}>
      <div className="dialog-box" style={{ minHeight: "auto", textAlign: "left", maxWidth: "400px" }}>
        {/* Header */}
        <div className="dialog-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>Change Passphrase</span>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            style={{ 
              background: "none", 
              border: "none", 
              color: "var(--text-secondary)", 
              cursor: "pointer",
              fontSize: "16px",
              padding: "0 4px"
            }}
            disabled={isLoading}
          >
            &times;
          </button>
        </div>

        {/* Warning Alert */}
        <div style={{
          backgroundColor: "rgba(235, 87, 87, 0.1)",
          border: "1px solid rgba(235, 87, 87, 0.3)",
          borderRadius: "4px",
          padding: "10px",
          marginBottom: "14px"
        }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eb5757" strokeWidth="2" style={{ flexShrink: 0, marginTop: "1px" }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div style={{ fontSize: "10px", color: "#eb5757", lineHeight: "1.4" }}>
              <strong>Important:</strong> Backups (.enc files) created with your current passphrase <strong>cannot</strong> be imported after you change it. Please make a new backup immediately after this change.
            </div>
          </div>
        </div>

        {/* Current Passphrase */}
        {hasCurrentPassphrase && (
          <div className="form-field" style={{ marginBottom: "10px" }}>
            <label className="form-label" htmlFor="current-passphrase-input">
              Current Passphrase
            </label>
            <div className="password-input-wrap">
              <input
                ref={inputRef}
                type={showCurrent ? "text" : "password"}
                id="current-passphrase-input"
                className="form-input"
                placeholder="Enter current passphrase..."
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                autoComplete="off"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowCurrent(!showCurrent)}
                tabIndex={-1}
                disabled={isLoading}
              >
                {showCurrent ? (
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

        {/* New Passphrase */}
        <div className="form-field" style={{ marginBottom: "10px" }}>
          <label className="form-label" htmlFor="new-passphrase-input">
            New Passphrase
          </label>
          <div className="password-input-wrap">
            <input
              type={showNew ? "text" : "password"}
              id="new-passphrase-input"
              className="form-input"
              placeholder="Enter new passphrase..."
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              autoComplete="off"
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowNew(!showNew)}
              tabIndex={-1}
              disabled={isLoading}
            >
              {showNew ? (
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

        {/* Confirm New Passphrase */}
        <div className="form-field" style={{ marginBottom: "10px" }}>
          <label className="form-label" htmlFor="confirm-new-passphrase-input">
            Confirm New Passphrase
          </label>
          <div className="password-input-wrap">
            <input
              type={showConfirm ? "text" : "password"}
              id="confirm-new-passphrase-input"
              className="form-input"
              placeholder="Re-enter new passphrase..."
              value={confirmNewPass}
              onChange={(e) => setConfirmNewPass(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              autoComplete="off"
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowConfirm(!showConfirm)}
              tabIndex={-1}
              disabled={isLoading}
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

        {/* Error */}
        {error && (
          <p style={{
            fontSize: "10px",
            color: "#ff5252",
            marginBottom: "10px",
            lineHeight: "1.4",
          }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="dialog-buttons" style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button className="dialog-btn" onClick={onClose} disabled={isLoading} style={{ background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
            Cancel
          </button>
          <button className="dialog-btn" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Saving..." : "Change Passphrase"}
          </button>
        </div>
      </div>
    </div>
  );
};
