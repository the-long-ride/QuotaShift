import React, { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fetchGoogleUserInfo } from "../../utils/auth/auth";
import type { AntigravityAccount } from "../../utils/common/types";
import { extractAntigravitySessionAccount } from "../../utils/antigravity/current-local-session";
import { findAntigravityAccountMatch } from "../../utils/account/current-account";
import {
  uniqueCapturedAntigravityAccounts,
  type CapturedAntigravitySource,
} from "../../utils/antigravity/capture-import";
import { resolveAccountCaptureLabel } from "../../utils/account/capture-label";
import { AccountCaptureLabelField } from "../common/AccountCaptureLabelField";

interface AntigravityCaptureTabProps {
  onAccountsCaptured: (
    accounts: AntigravityAccount[],
    currentAccount: AntigravityAccount,
  ) => Promise<number>;
  onCaptureBusyChange: (busy: boolean) => void;
  onRegisterCaptureHandler?: (handler: () => void) => void;
}

export const AntigravityCaptureTab: React.FC<AntigravityCaptureTabProps> = ({
  onAccountsCaptured,
  onCaptureBusyChange,
  onRegisterCaptureHandler,
}) => {
  const [captureLabel, setCaptureLabel] = useState("");
  const [captureStatusText, setCaptureStatusText] = useState<string | null>(null);
  const captureInFlight = useRef(false);

  const handleCaptureSession = async () => {
    if (captureInFlight.current) return;
    const label = captureLabel.trim();
    setCaptureStatusText(null);
    captureInFlight.current = true;
    onCaptureBusyChange(true);
    try {
      const sources = await invoke<CapturedAntigravitySource[]>("read_antigravity_sessions");
      if (!Array.isArray(sources) || sources.length === 0) {
        setCaptureStatusText(
          "No local Antigravity account found. Sign in through Antigravity 2.0, agy, or the IDE first.",
        );
        return;
      }
      const candidates: AntigravityAccount[] = [];
      const namedCandidates: AntigravityAccount[] = [];
      for (const source of sources) {
        let profile: Awaited<ReturnType<typeof fetchGoogleUserInfo>> = null;
        const account = extractAntigravitySessionAccount(source.session);
        if (!account) continue;
        const token = (source.session as Record<string, unknown>)[
          "antigravityUnifiedStateSync.oauthToken"
        ];
        if (typeof token === "string") {
          try {
            profile = await fetchGoogleUserInfo(token);
          } catch {
            // A local account can still be captured when UserInfo is unavailable.
          }
        }
        const enrichedAccount = extractAntigravitySessionAccount(
          source.session,
          undefined,
          profile,
        );
        if (!enrichedAccount) continue;
        candidates.push(enrichedAccount);
        if (profile?.name?.trim()) namedCandidates.push(enrichedAccount);
      }
      if (candidates.length === 0) {
        setCaptureStatusText("Local Antigravity sessions are invalid or incomplete.");
        return;
      }
      const unique = uniqueCapturedAntigravityAccounts(candidates);
      const hasAccountName =
        unique.length === 1 &&
        namedCandidates.some((candidate) => findAntigravityAccountMatch([candidate], unique[0]));
      if (unique.length === 1 && label && !hasAccountName) {
        unique[0] = {
          ...unique[0],
          label: resolveAccountCaptureLabel({
            fallbackLabel: label,
            email: unique[0].email,
            defaultLabel: unique[0].label,
          }),
        };
      }
      await onAccountsCaptured(unique, candidates[0]);
    } catch (err: unknown) {
      setCaptureStatusText(`Capture failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      captureInFlight.current = false;
      onCaptureBusyChange(false);
    }
  };

  React.useEffect(() => {
    onRegisterCaptureHandler?.(handleCaptureSession);
  }, [handleCaptureSession, onRegisterCaptureHandler]);

  return (
    <div>
      <div className="account-form" style={{ padding: "10px 0" }}>
        <p className="oauth-step-desc" style={{ marginBottom: "12px" }}>
          Import signed-in accounts from Antigravity 2.0, agy, and the older IDE. Each account is
          added once. Captured tokens may lack the cloud-platform scope needed for the quota API.
        </p>
        <AccountCaptureLabelField
          id="antigravity-label-input"
          value={captureLabel}
          onChange={setCaptureLabel}
          onSubmit={handleCaptureSession}
        />
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
          role="status"
        >
          {captureStatusText}
        </div>
      )}
    </div>
  );
};
