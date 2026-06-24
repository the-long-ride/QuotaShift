import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { obfuscate, deobfuscate, fetchGoogleUserInfo, decodeJwtEmail } from "../utils/auth";
import { AntigravityAccount } from "../utils/types";
import { AccountModalLayout } from "./AccountModalLayout";

interface AddAntigravityAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountAdded: (accountId: string) => void;
  loadAccounts: () => AntigravityAccount[];
  saveAccounts: (accounts: AntigravityAccount[]) => void;
  setActiveAccountId: (id: string) => void;
}

export const AddAntigravityAccountModal: React.FC<AddAntigravityAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountAdded,
  loadAccounts,
  saveAccounts,
  setActiveAccountId,
}) => {
  // Capture Session state
  const [captureLabel, setCaptureLabel] = useState("Work Profile");
  const [captureStatusText, setCaptureStatusText] = useState<string | null>(null);

  const captureLabelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Reset state on open
    setCaptureLabel("Work Profile");
    setCaptureStatusText(null);

    setTimeout(() => {
      captureLabelRef.current?.focus();
    }, 100);
  }, [isOpen]);

  if (!isOpen) return null;

  const extractEmailFromUserStatus = (userStatus: any): string | null => {
    if (!userStatus) return null;
    try {
      if (typeof userStatus === "string") {
        const parsed = JSON.parse(userStatus);
        return parsed.userInfo?.email || parsed.email || null;
      }
      return userStatus.userInfo?.email || userStatus.email || null;
    } catch (e) {
      console.error("Failed to extract email from userStatus:", e);
    }
    return null;
  };

  // Capture Session submission
  const handleCaptureSession = async () => {
    let label = captureLabel.trim();
    if (!label) {
      captureLabelRef.current?.focus();
      return;
    }

    setCaptureStatusText(null);
    try {
      const session = await invoke<any>("read_antigravity_session");
      const token = session["antigravityUnifiedStateSync.oauthToken"];
      const refreshToken = session["antigravity.refreshToken"];
      const profileUrl = session["antigravity.profileUrl"];
      const userStatus = session["antigravityUnifiedStateSync.userStatus"];

      if (!token) {
        setCaptureStatusText("No active session found in Antigravity IDE database. Please log in first.");
        return;
      }

      let email = extractEmailFromUserStatus(userStatus);
      if (!email && session["antigravity.idToken"]) {
        email = decodeJwtEmail(session["antigravity.idToken"]);
      }
      let finalProfileUrl = profileUrl ? obfuscate(profileUrl) : undefined;

      // Enrich with Google UserInfo
      try {
        const userInfo = await fetchGoogleUserInfo(token);
        if (userInfo) {
          if (userInfo.email) email = userInfo.email;
          if (userInfo.picture && !finalProfileUrl) {
            finalProfileUrl = obfuscate(userInfo.picture);
          }
          if (label === "Work Profile" && userInfo.name) {
            label = userInfo.name;
          }
        }
      } catch (e) {
        console.error("Failed to fetch Google UserInfo during capture:", e);
      }

      const accounts = loadAccounts();
      const obfuscatedToken = obfuscate(token);
      const obfuscatedRefresh = refreshToken ? obfuscate(refreshToken) : undefined;

      const existingIdx = accounts.findIndex(
        (a) => deobfuscate(a.token) === token || (email && a.email?.toLowerCase() === email.toLowerCase())
      );

      const newAccount: AntigravityAccount = {
        id: existingIdx !== -1 ? accounts[existingIdx].id : `ag-acct-${Date.now()}`,
        label,
        token: obfuscatedToken,
        refreshToken: obfuscatedRefresh,
        profileUrl: finalProfileUrl,
        email: email || undefined,
      };

      if (existingIdx !== -1) {
        accounts[existingIdx] = newAccount;
      } else {
        accounts.push(newAccount);
      }

      saveAccounts(accounts);
      setActiveAccountId(newAccount.id);

      onClose();
      onAccountAdded(newAccount.id);
    } catch (err: any) {
      setCaptureStatusText(`Capture failed: ${err?.message ?? String(err)}`);
    }
  };

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title="Connect Antigravity Account"
      icon={
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
      }
      footerButtons={
        <>
          <button
            className="dialog-btn dialog-btn--cancel"
            onClick={onClose}
            data-tooltip="Cancel connecting Antigravity account and close dialog"
          >
            Cancel
          </button>
          <button
            className="dialog-btn"
            onClick={handleCaptureSession}
            data-tooltip="Search and import active session from Antigravity database"
          >
            Capture Session
          </button>
        </>
      }
    >
      <div className="account-form" style={{ padding: "10px 0" }}>
        <p className="oauth-step-desc" style={{ marginBottom: "12px" }}>
          Import the active session currently logged in via the Antigravity IDE.
        </p>
        <div className="form-field" style={{ marginBottom: "12px" }}>
          <label className="form-label" htmlFor="antigravity-label-input">
            Account Label
          </label>
          <input
            ref={captureLabelRef}
            type="text"
            id="antigravity-label-input"
            className="form-input"
            placeholder="e.g. Work Profile"
            maxLength={32}
            value={captureLabel}
            onChange={(e) => setCaptureLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCaptureSession();
              }
            }}
          />
        </div>
      </div>

      {captureStatusText && (
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
          {captureStatusText}
        </div>
      )}
    </AccountModalLayout>
  );
};

