import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { obfuscate, fetchGoogleUserInfo, decodeJwtEmail } from "../utils/auth";
import { AntigravityAccount } from "../utils/types";
import { AccountModalLayout } from "./AccountModalLayout";
import { AntigravityCaptureTab } from "./AntigravityCaptureTab";
import { AntigravityOAuthStepView } from "./AntigravityOAuthStepView";

interface AddAntigravityAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountAdded: (accountId: string) => void;
  loadAccounts: () => AntigravityAccount[];
  saveAccounts: (accounts: AntigravityAccount[]) => void;
  setActiveAccountId: (id: string) => void;
  onLocalSessionCaptured: (account: AntigravityAccount) => void;
}

export const AddAntigravityAccountModal: React.FC<AddAntigravityAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountAdded,
  loadAccounts,
  saveAccounts,
  setActiveAccountId,
  onLocalSessionCaptured,
}) => {
  const [activeTab, setActiveTab] = useState<"browser" | "capture">("browser");
  const [oauthStep, setOauthStep] = useState<1 | 2 | 3>(1);
  const [oauthLabel, setOauthLabel] = useState("Work Profile");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthStatusText, setOauthStatusText] = useState("");
  const [oauthStatusType, setOauthStatusType] = useState<"normal" | "error" | "success">("normal");

  const browserLabelRef = useRef<HTMLInputElement>(null);
  const captureHandlerRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!isOpen) return;
    setOauthStep(1);
    setOauthLabel("Work Profile");
    setOauthLoading(false);
    setOauthStatusText("");
    setOauthStatusType("normal");
    setActiveTab("browser");
    setTimeout(() => {
      browserLabelRef.current?.focus();
    }, 100);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      const u = await listen<{ code?: string; error?: string }>(
        "google-oauth-callback",
        async (event) => {
          const { code, error } = event.payload;
          if (error) {
            setOauthStatusType("error");
            setOauthStatusText(`Login failed: ${error}`);
            setOauthLoading(false);
            return;
          }
          if (!code) {
            setOauthStatusType("error");
            setOauthStatusText("No authorization code returned.");
            setOauthLoading(false);
            return;
          }

          setOauthStep(3);
          setOauthStatusType("normal");
          setOauthStatusText("Exchanging code for Google tokens...");
          setOauthLoading(true);

          try {
            const tokenJson = await invoke<any>("exchange_antigravity_google_token", { code });
            const accessToken = tokenJson.access_token;
            const refreshToken = tokenJson.refresh_token;

            if (!accessToken) {
              setOauthStatusType("error");
              setOauthStatusText("Failed to obtain access token from Google.");
              setOauthLoading(false);
              return;
            }

            let email: string | undefined;
            let profileUrl: string | undefined;
            if (tokenJson.id_token) {
              email = decodeJwtEmail(tokenJson.id_token) ?? undefined;
            }
            try {
              const userInfo = await fetchGoogleUserInfo(accessToken);
              if (userInfo) {
                if (userInfo.email) email = userInfo.email;
                if (userInfo.picture) profileUrl = userInfo.picture;
              }
            } catch (e) {
              console.error("Failed to fetch Google UserInfo:", e);
            }

            let label = oauthLabel.trim() || "Work Profile";

            const accounts = loadAccounts();
            const existingIdx = email
              ? accounts.findIndex((a) => a.email?.toLowerCase() === email?.toLowerCase())
              : -1;

            const newAccount: AntigravityAccount = {
              id: existingIdx !== -1 ? accounts[existingIdx].id : `ag-acct-${Date.now()}`,
              label,
              token: obfuscate(accessToken),
              refreshToken: refreshToken ? obfuscate(refreshToken) : undefined,
              email: email || undefined,
              profileUrl: profileUrl ? obfuscate(profileUrl) : undefined,
              authMethod: tokenJson.authMethod || "consumer",
            };

            if (existingIdx !== -1) {
              accounts[existingIdx] = { ...accounts[existingIdx], ...newAccount };
            } else {
              accounts.push(newAccount);
            }
            saveAccounts(accounts);
            setActiveAccountId(newAccount.id);

            // NOTE: Browser login only collects the token into the in-app account list
            // for quota monitoring — it does NOT touch the Antigravity IDE session.
            // Use the "Apply" button on an account card later to switch the IDE login.

            setOauthStatusType("success");
            setOauthStatusText(
              "Account added successfully. Use the Apply button to switch the IDE session.",
            );
            setOauthLoading(false);

            setTimeout(() => {
              onClose();
              onAccountAdded(newAccount.id);
            }, 1000);
          } catch (err: any) {
            setOauthStatusType("error");
            setOauthStatusText(err?.message ?? String(err));
            setOauthLoading(false);
          }
        },
      );
      if (!active) {
        u();
      } else {
        unlistenFn = u;
      }
    };
    setupListener();
    return () => {
      active = false;
      if (unlistenFn) unlistenFn();
      invoke("reset_google_oauth_session").catch(console.error);
    };
  }, [isOpen, oauthLabel]);

  if (!isOpen) return null;

  const handleTabSwitch = (tab: "browser" | "capture") => {
    setActiveTab(tab);
    if (tab === "browser") {
      setTimeout(() => browserLabelRef.current?.focus(), 100);
    }
  };

  const handleStartBrowserLogin = async () => {
    setOauthStatusType("normal");
    setOauthStatusText("");
    try {
      setOauthLoading(true);
      const authUrl = await invoke<string>("start_antigravity_google_oauth");
      openUrl(authUrl);
      setOauthStep(2);
      setOauthStatusText("Awaiting callback from browser...");
    } catch (err: any) {
      setOauthLoading(false);
      setOauthStatusType("error");
      setOauthStatusText(err?.message ?? String(err));
    }
  };

  const handleCopyLoginLink = async () => {
    setOauthStatusType("normal");
    setOauthStatusText("");
    try {
      setOauthLoading(true);
      const authUrl = await invoke<string>("start_antigravity_google_oauth");
      await navigator.clipboard.writeText(authUrl);
      setOauthStep(2);
      setOauthStatusType("success");
      setOauthStatusText("Link copied! Authenticate in your browser.");
    } catch (err: any) {
      setOauthLoading(false);
      setOauthStatusType("error");
      setOauthStatusText(err?.message ?? String(err));
    }
  };

  const handleResetSession = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await invoke("reset_google_oauth_session");
      setOauthStep(1);
      setOauthLoading(false);
      setOauthStatusText("");
      setOauthStatusType("normal");
    } catch {}
  };

  const renderFooterButtons = () => {
    if (activeTab === "capture") {
      return (
        <>
          <button className="dialog-btn dialog-btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="dialog-btn" onClick={() => captureHandlerRef.current()}>
            Capture Session
          </button>
        </>
      );
    }
    return (
      <button className="dialog-btn dialog-btn--cancel" onClick={onClose}>
        Cancel
      </button>
    );
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
      tabs={
        <div className="modal-tab-bar">
          <button
            className={`modal-tab ${activeTab === "browser" ? "modal-tab--active" : ""}`}
            onClick={() => handleTabSwitch("browser")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="9"
              height="9"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
            Browser Login
          </button>
          <button
            className={`modal-tab ${activeTab === "capture" ? "modal-tab--active" : ""}`}
            onClick={() => handleTabSwitch("capture")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="9"
              height="9"
            >
              <path
                d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            Capture Session
          </button>
        </div>
      }
      footerButtons={renderFooterButtons()}
    >
      {activeTab === "browser" && (
        <AntigravityOAuthStepView
          oauthStep={oauthStep}
          oauthLabel={oauthLabel}
          setOauthLabel={setOauthLabel}
          oauthLoading={oauthLoading}
          oauthStatusText={oauthStatusText}
          oauthStatusType={oauthStatusType}
          browserLabelRef={browserLabelRef}
          handleStartBrowserLogin={handleStartBrowserLogin}
          handleCopyLoginLink={handleCopyLoginLink}
          handleResetSession={handleResetSession}
        />
      )}

      {activeTab === "capture" && (
        <AntigravityCaptureTab
          onClose={onClose}
          onLocalSessionCaptured={onLocalSessionCaptured}
          onRegisterCaptureHandler={(h) => {
            captureHandlerRef.current = h;
          }}
        />
      )}
    </AccountModalLayout>
  );
};
