import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
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
  const [activeTab, setActiveTab] = useState<"browser" | "capture">("browser");
  const [captureLabel, setCaptureLabel] = useState("Work Profile");
  const [captureStatusText, setCaptureStatusText] = useState<string | null>(null);

  const [oauthStep, setOauthStep] = useState<1 | 2 | 3>(1);
  const [oauthLabel, setOauthLabel] = useState("Work Profile");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthStatusText, setOauthStatusText] = useState("");
  const [oauthStatusType, setOauthStatusType] = useState<"normal" | "error" | "success">("normal");
  const [oauthGcloudProjectId, setOauthGcloudProjectId] = useState("");
  const [oauthGcloudServiceName, setOauthGcloudServiceName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const captureLabelRef = useRef<HTMLInputElement>(null);
  const browserLabelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCaptureLabel("Work Profile");
    setCaptureStatusText(null);
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
      const u = await listen<{ code?: string; error?: string }>("google-oauth-callback", async (event) => {
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
          if (tokenJson.id_token) {
            email = decodeJwtEmail(tokenJson.id_token) ?? undefined;
          }
          if (!email) {
            try {
              const userInfo = await fetchGoogleUserInfo(accessToken);
              if (userInfo?.email) email = userInfo.email;
            } catch {}
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
            authMethod: tokenJson.authMethod || "consumer",
            gcloudProjectId: oauthGcloudProjectId.trim() || undefined,
            gcloudServiceName: oauthGcloudServiceName.trim() || undefined,
          };

          if (existingIdx !== -1) {
            accounts[existingIdx] = newAccount;
          } else {
            accounts.push(newAccount);
          }
          saveAccounts(accounts);
          setActiveAccountId(newAccount.id);

          try {
            await invoke("write_antigravity_session", {
              token: accessToken,
              refreshToken: refreshToken || null,
              profileUrl: null,
              email: email || null,
            });
          } catch (writeErr) {
            console.warn("Failed to write session to IDE stores:", writeErr);
          }

          setOauthStatusType("success");
          setOauthStatusText("Connected successfully! Tokens also written to Antigravity session stores.");
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
      });
      if (!active) { u(); } else { unlistenFn = u; }
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
    setTimeout(() => {
      if (tab === "capture") captureLabelRef.current?.focus();
      else browserLabelRef.current?.focus();
    }, 100);
  };

  const extractEmailFromUserStatus = (userStatus: any): string | null => {
    if (!userStatus) return null;
    try {
      if (typeof userStatus === "string") {
        const parsed = JSON.parse(userStatus);
        return parsed.userInfo?.email || parsed.email || null;
      }
      return userStatus.userInfo?.email || userStatus.email || null;
    } catch { return null; }
  };

  const handleCaptureSession = async () => {
    let label = captureLabel.trim();
    if (!label) { captureLabelRef.current?.focus(); return; }
    setCaptureStatusText(null);
    try {
      const session = await invoke<any>("read_antigravity_session");
      const token = session["antigravityUnifiedStateSync.oauthToken"];
      const refreshToken = session["antigravity.refreshToken"];
      const profileUrl = session["antigravity.profileUrl"];
      const userStatus = session["antigravityUnifiedStateSync.userStatus"];
      const authMethod = session["antigravity.authMethod"];

      if (!token) {
        setCaptureStatusText("No active session found. Please log in via Antigravity IDE first, or use Browser Login.");
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
          if (userInfo.picture && !finalProfileUrl) finalProfileUrl = obfuscate(userInfo.picture);
          if (label === "Work Profile" && userInfo.name) label = userInfo.name;
        }
      } catch {}

      const accounts = loadAccounts();
      const existingIdx = accounts.findIndex(
        (a) => deobfuscate(a.token) === token || (email && a.email?.toLowerCase() === email.toLowerCase())
      );
      const newAccount: AntigravityAccount = {
        id: existingIdx !== -1 ? accounts[existingIdx].id : `ag-acct-${Date.now()}`,
        label,
        token: obfuscate(token),
        refreshToken: refreshToken ? obfuscate(refreshToken) : undefined,
        profileUrl: finalProfileUrl,
        email: email || undefined,
        authMethod: authMethod || undefined,
      };
      if (existingIdx !== -1) { accounts[existingIdx] = newAccount; } else { accounts.push(newAccount); }
      saveAccounts(accounts);
      setActiveAccountId(newAccount.id);
      onClose();
      onAccountAdded(newAccount.id);
    } catch (err: any) {
      setCaptureStatusText(`Capture failed: ${err?.message ?? String(err)}`);
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
          <button className="dialog-btn dialog-btn--cancel" onClick={onClose}>Cancel</button>
          <button className="dialog-btn" onClick={handleCaptureSession}>Capture Session</button>
        </>
      );
    }
    return <button className="dialog-btn dialog-btn--cancel" onClick={onClose}>Cancel</button>;
  };

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title="Connect Antigravity Account"
      icon={
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14" style={{ color: "var(--accent-white)" }}>
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
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="9" height="9">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
              <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            Browser Login
          </button>
          <button
            className={`modal-tab ${activeTab === "capture" ? "modal-tab--active" : ""}`}
            onClick={() => handleTabSwitch("capture")}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="9" height="9">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            Capture Session
          </button>
        </div>
      }
      footerButtons={renderFooterButtons()}
    >
      {activeTab === "browser" && (
        <div>
          <ol className="oauth-steps">
            <li className={`oauth-step ${oauthStep === 1 ? "oauth-step--active" : oauthStep > 1 ? "oauth-step--done" : ""}`}>
              <div className="oauth-step-num">1</div>
              <div className="oauth-step-body">
                <div className="form-field" style={{ marginBottom: "8px" }}>
                  <label className="form-label" style={{ fontSize: "9px" }}>Account Label</label>
                  <input
                    ref={browserLabelRef}
                    type="text"
                    className="form-input"
                    style={{ height: "24px", fontSize: "10.5px" }}
                    value={oauthLabel}
                    onChange={(e) => setOauthLabel(e.target.value)}
                  />
                </div>
                <p className="oauth-step-title">Sign in with Google</p>
                <p className="oauth-step-desc">Grants cloud-platform scope needed for quota API. Tokens are also written back to your Antigravity IDE session.</p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    className={`oauth-open-btn ${oauthStep > 1 ? "oauth-open-btn--done" : ""} ${oauthLoading && oauthStep === 1 ? "loading" : ""}`}
                    onClick={handleStartBrowserLogin}
                    disabled={oauthStep > 1 || oauthLoading}
                  >
                    {oauthStep > 1 ? "Login page opened" : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="11" height="11">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          <path d="M15 3h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        Sign in with Google
                      </>
                    )}
                  </button>
                  {oauthStep === 1 && (
                    <button className="oauth-copy-btn" onClick={handleCopyLoginLink} disabled={oauthLoading}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="11" height="11">
                        <path d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V8a2 2 0 00-2-2h-4M8 4a2 2 0 012-2h3m-5 4H5a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Copy Link
                    </button>
                  )}
                </div>

                <div style={{ marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowAdvanced(!showAdvanced); }}
                    style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "9px", padding: 0, textDecoration: "underline", opacity: 0.7 }}
                  >
                    {showAdvanced ? "▾ Advanced: GCP quota fallback" : "▸ Advanced: GCP quota fallback"}
                  </button>
                  {showAdvanced && (
                    <div style={{ marginTop: "8px", padding: "8px", background: "rgba(255,255,255,0.03)", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                      <p style={{ fontSize: "8.5px", color: "var(--text-secondary)", marginBottom: "8px", opacity: 0.8 }}>
                        If cloudcode-pa returns 403, QuotaShift falls back to Google Cloud Service Usage + Monitoring APIs for project-level quota. Leave blank to skip fallback.
                      </p>
                      <div className="form-field" style={{ marginBottom: "6px" }}>
                        <label className="form-label" style={{ fontSize: "9px" }}>GCP Project ID</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ height: "22px", fontSize: "10.5px" }}
                          placeholder="e.g. my-gcp-project"
                          value={oauthGcloudProjectId}
                          onChange={(e) => setOauthGcloudProjectId(e.target.value)}
                        />
                      </div>
                      <div className="form-field">
                        <label className="form-label" style={{ fontSize: "9px" }}>Service Name</label>
                        <select
                          className="form-input"
                          style={{ height: "24px", fontSize: "10px" }}
                          value={oauthGcloudServiceName}
                          onChange={(e) => setOauthGcloudServiceName(e.target.value)}
                        >
                          <option value="">— Skip —</option>
                          <option value="generativelanguage.googleapis.com">generativelanguage.googleapis.com</option>
                          <option value="aiplatform.googleapis.com">aiplatform.googleapis.com</option>
                          <option value="cloudaicompanion.googleapis.com">cloudaicompanion.googleapis.com</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </li>
            <li className={`oauth-step ${oauthStep === 2 ? "oauth-step--active" : oauthStep > 2 ? "oauth-step--done" : ""}`}>
              <div className="oauth-step-num">2</div>
              <div className="oauth-step-body">
                <p className="oauth-step-title">Complete Login in Browser</p>
                <p className="oauth-step-desc">Authenticate with your Google account. The page will redirect back automatically.</p>
              </div>
            </li>
            <li className={`oauth-step ${oauthStep === 3 ? "oauth-step--active" : ""}`}>
              <div className="oauth-step-num">3</div>
              <div className="oauth-step-body">
                <p className="oauth-step-title">Connected!</p>
                <p className="oauth-step-desc">Your Antigravity account is connected. Tokens are written to the IDE session stores.</p>
              </div>
            </li>
          </ol>

          {oauthStatusText && (
            <div className={`oauth-validate-row ${oauthStatusType === "error" ? "oauth-validate-row--error" : oauthStatusType === "success" ? "oauth-validate-row--success" : ""}`}>
              {oauthLoading && <div className="oauth-spinner" />}
              <span className="oauth-validate-text">
                {oauthStatusText.includes("bind to port 1456") ? (
                  <>
                    {oauthStatusText}{" "}
                    <a href="#" onClick={handleResetSession} style={{ color: "var(--text-primary)", textDecoration: "underline", marginLeft: "6px", fontWeight: 600 }}>
                      Reset Session
                    </a>
                  </>
                ) : (
                  oauthStatusText
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {activeTab === "capture" && (
        <div>
          <div className="account-form" style={{ padding: "10px 0" }}>
            <p className="oauth-step-desc" style={{ marginBottom: "12px" }}>
              Import the active session from your installed Antigravity IDE. Note: captured tokens may lack the cloud-platform scope needed for the quota API — Browser Login is preferred.
            </p>
            <div className="form-field" style={{ marginBottom: "12px" }}>
              <label className="form-label" htmlFor="antigravity-label-input">Account Label</label>
              <input
                ref={captureLabelRef}
                type="text"
                id="antigravity-label-input"
                className="form-input"
                placeholder="e.g. Work Profile"
                maxLength={32}
                value={captureLabel}
                onChange={(e) => setCaptureLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCaptureSession(); } }}
              />
            </div>
          </div>
          {captureStatusText && (
            <div style={{ fontSize: "10.5px", marginBottom: "10px", padding: "6px", borderRadius: "4px", background: "rgba(220, 38, 38, 0.1)", border: "1px solid rgba(220, 38, 38, 0.2)", color: "#f87171", textAlign: "center" }}>
              {captureStatusText}
            </div>
          )}
        </div>
      )}
    </AccountModalLayout>
  );
};
