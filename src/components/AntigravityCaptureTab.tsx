import React, { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { obfuscate, fetchGoogleUserInfo, decodeJwtEmail } from "../utils/auth";
import type { AntigravityAccount } from "../utils/types";

interface AntigravityCaptureTabProps {
  onClose: () => void;
  onLocalSessionCaptured: (account: AntigravityAccount) => void;
  onRegisterCaptureHandler?: (handler: () => void) => void;
}

const extractEmailFromUserStatus = (userStatus: any): string | null => {
  if (!userStatus) return null;
  try {
    if (typeof userStatus === "string") {
      const parsed = JSON.parse(userStatus);
      return parsed.userInfo?.email || parsed.email || null;
    }
    return userStatus.userInfo?.email || userStatus.email || null;
  } catch {
    return null;
  }
};

export const AntigravityCaptureTab: React.FC<AntigravityCaptureTabProps> = ({
  onClose,
  onLocalSessionCaptured,
  onRegisterCaptureHandler,
}) => {
  const [captureLabel, setCaptureLabel] = useState("Work Profile");
  const [captureStatusText, setCaptureStatusText] = useState<string | null>(null);
  const captureLabelRef = useRef<HTMLInputElement>(null);

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
      const authMethod = session["antigravity.authMethod"];

      if (!token) {
        setCaptureStatusText(
          "No active session found. Please log in via Antigravity IDE first, or use Browser Login.",
        );
        return;
      }

      let email = extractEmailFromUserStatus(userStatus);
      if (!email && session["antigravity.idToken"]) {
        email = decodeJwtEmail(session["antigravity.idToken"]);
      }
      let finalProfileUrl = profileUrl ? obfuscate(profileUrl) : undefined;

      try {
        const userInfo = await fetchGoogleUserInfo(token);
        if (userInfo) {
          if (userInfo.email) email = userInfo.email;
          if (userInfo.picture && !finalProfileUrl) {
            finalProfileUrl = obfuscate(userInfo.picture);
          }
          if (label === "Work Profile" && userInfo.name) label = userInfo.name;
        }
      } catch {}

      const capturedAccount: AntigravityAccount = {
        id: "local-antigravity-session",
        label,
        token: obfuscate(token),
        refreshToken: refreshToken ? obfuscate(refreshToken) : undefined,
        profileUrl: finalProfileUrl,
        email: email || undefined,
        authMethod: authMethod || undefined,
      };
      onLocalSessionCaptured(capturedAccount);
      setCaptureStatusText(
        "Local Antigravity session captured. Use Add to monitored list on the protected card to save it.",
      );
      setTimeout(onClose, 600);
    } catch (err: any) {
      setCaptureStatusText(`Capture failed: ${err?.message ?? String(err)}`);
    }
  };

  React.useEffect(() => {
    onRegisterCaptureHandler?.(handleCaptureSession);
  }, [handleCaptureSession, onRegisterCaptureHandler]);

  return (
    <div>
      <div className="account-form" style={{ padding: "10px 0" }}>
        <p className="oauth-step-desc" style={{ marginBottom: "12px" }}>
          Import the active session from your installed Antigravity IDE. Note: captured tokens may
          lack the cloud-platform scope needed for the quota API — Browser Login is preferred.
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
    </div>
  );
};
