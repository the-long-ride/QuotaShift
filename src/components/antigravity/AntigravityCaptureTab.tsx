import React, { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fetchGoogleUserInfo } from "../../utils/auth/auth";
import type { AntigravityAccount } from "../../utils/common/types";
import { extractAntigravitySessionAccount } from "../../utils/antigravity/current-local-session";

interface AntigravityCaptureTabProps {
  onClose: () => void;
  onLocalSessionCaptured: (account: AntigravityAccount) => void;
  onRegisterCaptureHandler?: (handler: () => void) => void;
}

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
      if (!token) {
        setCaptureStatusText(
          "No active session found. Please log in via Antigravity IDE first, or use Browser Login.",
        );
        return;
      }
      let profile: { email?: string; picture?: string; name?: string } | null = null;
      try {
        const userInfo = await fetchGoogleUserInfo(token);
        profile = userInfo;
        if (label === "Work Profile" && userInfo?.name) label = userInfo.name;
      } catch {}
      const capturedAccount: AntigravityAccount | null = extractAntigravitySessionAccount(session, label, profile);
      if (!capturedAccount) {
        setCaptureStatusText("Active Antigravity session is invalid or incomplete.");
        return;
      }
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
