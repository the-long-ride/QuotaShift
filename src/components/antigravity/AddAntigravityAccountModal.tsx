import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { obfuscate, fetchGoogleUserInfo, decodeJwtProfile } from "../../utils/auth/auth";
import { AntigravityAccount } from "../../utils/common/types";
import { AccountModalLayout } from "../common/AccountModalLayout";
import { useCloseOnEscape } from "../common/useCloseOnEscape";
import { AntigravityCaptureTab } from "./AntigravityCaptureTab";
import { AntigravityOAuthStepView } from "./AntigravityOAuthStepView";
import { AntigravityModalTabs, AntigravityModalHeaderIcon } from "./AntigravityModalTabs";

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
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthStatusText, setOauthStatusText] = useState("");
  const [oauthStatusType, setOauthStatusType] = useState<"normal" | "error" | "success">("normal");

  const captureHandlerRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!isOpen) return;
    setOauthStep(1);
    setOauthLoading(false);
    setOauthStatusText("");
    setOauthStatusType("normal");
    setActiveTab("browser");
  }, [isOpen]);
  useCloseOnEscape(isOpen, onClose);

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

            const idProfile = decodeJwtProfile(tokenJson.id_token);
            let email: string | undefined = tokenJson.email || idProfile?.email || undefined;
            let profileUrl: string | undefined =
              tokenJson.picture || idProfile?.picture || undefined;
            let displayName: string | undefined =
              (typeof tokenJson.name === "string" ? tokenJson.name.trim() : "") ||
              idProfile?.name?.trim() ||
              undefined;

            if (!email || !profileUrl || !displayName) {
              try {
                const userInfo = await fetchGoogleUserInfo(accessToken);
                if (userInfo) {
                  if (userInfo.email && !email) email = userInfo.email;
                  if (userInfo.picture && !profileUrl) profileUrl = userInfo.picture;
                  if (userInfo.name && !displayName)
                    displayName = userInfo.name.trim() || undefined;
                }
              } catch (e) {
                console.error("Failed to fetch Google UserInfo:", e);
              }
            }

            const accounts = loadAccounts();
            const existingIdx = email
              ? accounts.findIndex((a) => a.email?.toLowerCase() === email?.toLowerCase())
              : -1;
            const emailLocalPart = email?.split("@")[0]?.trim();
            const derivedLabel = displayName || emailLocalPart || "Antigravity";
            const label =
              existingIdx !== -1 && accounts[existingIdx].label?.trim()
                ? accounts[existingIdx].label
                : derivedLabel;

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
            saveAccounts([...accounts]);
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
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTabSwitch = (tab: "browser" | "capture") => {
    setActiveTab(tab);
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
          <button
            type="button"
            className="dialog-btn dialog-btn--cancel"
            onClick={onClose}
            data-tooltip="Cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn"
            onClick={() => captureHandlerRef.current()}
            data-tooltip="Capture Session"
          >
            Capture Session
          </button>
        </>
      );
    }
    return (
      <button
        type="button"
        className="dialog-btn dialog-btn--cancel"
        onClick={onClose}
        data-tooltip="Cancel"
      >
        Cancel
      </button>
    );
  };

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title="Connect Antigravity Account"
      icon={<AntigravityModalHeaderIcon />}
      tabs={<AntigravityModalTabs activeTab={activeTab} onTabSwitch={handleTabSwitch} />}
      footerButtons={renderFooterButtons()}
    >
      {activeTab === "browser" && (
        <AntigravityOAuthStepView
          oauthStep={oauthStep}
          oauthLoading={oauthLoading}
          oauthStatusText={oauthStatusText}
          oauthStatusType={oauthStatusType}
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
