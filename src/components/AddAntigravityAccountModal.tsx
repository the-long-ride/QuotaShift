import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { obfuscate, deobfuscate, fetchGoogleUserInfo } from "../utils/auth";
import { AntigravityAccount } from "../utils/types";

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
  const [activeTab, setActiveTab] = useState<"capture" | "browser">("capture");

  // Capture Session state
  const [captureLabel, setCaptureLabel] = useState("Work Profile");
  const [captureStatusText, setCaptureStatusText] = useState<string | null>(null);

  // Browser Login state
  const [oauthLabel, setOauthLabel] = useState("Antigravity Account");
  const [oauthStep, setOauthStep] = useState<1 | 2 | 3>(1);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthStatusText, setOauthStatusText] = useState("");
  const [oauthStatusType, setOauthStatusType] = useState<"normal" | "error" | "success">("normal");

  const captureLabelRef = useRef<HTMLInputElement>(null);
  const oauthLabelRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Reset state on open
    setCaptureLabel("Work Profile");
    setCaptureStatusText(null);
    setOauthLabel("Antigravity Account");
    setOauthStep(1);
    setOauthLoading(false);
    setOauthStatusText("");
    setOauthStatusType("normal");
    setActiveTab("capture");

    setTimeout(() => {
      captureLabelRef.current?.focus();
    }, 100);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleTabSwitch = (tab: "capture" | "browser") => {
    setActiveTab(tab);
    setTimeout(() => {
      if (tab === "capture") captureLabelRef.current?.focus();
      else if (tab === "browser") oauthLabelRef.current?.focus();
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
        (a) => deobfuscate(a.token) === token || (email && a.email === email)
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

  // Browser login flow
  const handleStartBrowserLogin = async () => {
    const label = oauthLabel.trim();
    if (!label) {
      oauthLabelRef.current?.focus();
      return;
    }

    try {
      setOauthLoading(true);
      setOauthStatusType("normal");
      setOauthStatusText("Quitting Antigravity IDE...");
      await invoke("quit_antigravity_ide");

      setOauthStatusText("Clearing active token...");
      await invoke("delete_antigravity_session");

      setOauthStatusText("Launching Antigravity IDE...");
      await invoke("open_antigravity_ide");

      setOauthStep(2);
      setOauthStatusText("Waiting for you to click Sign In and complete Google Login in browser...");

      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const session = await invoke<any>("read_antigravity_session");
          const token = session["antigravityUnifiedStateSync.oauthToken"];
          const refreshToken = session["antigravity.refreshToken"];
          const profileUrl = session["antigravity.profileUrl"];
          const userStatus = session["antigravityUnifiedStateSync.userStatus"];

          if (token) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }

            setOauthStep(3);
            setOauthStatusType("success");
            setOauthStatusText("✓ Connected successfully!");
            setOauthLoading(false);

            let email = extractEmailFromUserStatus(userStatus);
            let finalProfileUrl = profileUrl ? obfuscate(profileUrl) : undefined;
            let finalLabel = label;

            try {
              const userInfo = await fetchGoogleUserInfo(token);
              if (userInfo) {
                if (userInfo.email) email = userInfo.email;
                if (userInfo.picture && !finalProfileUrl) {
                  finalProfileUrl = obfuscate(userInfo.picture);
                }
                if (label === "Antigravity Account" && userInfo.name) {
                  finalLabel = userInfo.name;
                }
              }
            } catch (e) {
              console.error("Failed to fetch Google UserInfo during capture:", e);
            }

            const accounts = loadAccounts();
            const obfuscatedToken = obfuscate(token);
            const obfuscatedRefresh = refreshToken ? obfuscate(refreshToken) : undefined;

            const existingIdx = accounts.findIndex(
              (a) => deobfuscate(a.token) === token || (email && a.email === email)
            );

            const newAccount: AntigravityAccount = {
              id: existingIdx !== -1 ? accounts[existingIdx].id : `ag-acct-${Date.now()}`,
              label: finalLabel,
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

            setTimeout(() => {
              onClose();
              onAccountAdded(newAccount.id);
            }, 1500);
          }
        } catch (err) {
          console.error("Polling read_antigravity_session failed:", err);
        }
      }, 1000);
    } catch (err: any) {
      setOauthLoading(false);
      setOauthStatusType("error");
      setOauthStatusText(`OAuth failed: ${err?.message ?? String(err)}`);
    }
  };

  const handleCancelOauth = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    onClose();
  };

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancelOauth();
      }}
      style={{ display: "flex" }}
    >
      <div className="dialog-box dialog-box--account">
        <div className="dialog-header">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            style={{ color: "var(--accent-white)" }}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" />
            <path d="M9 17V7l7 5-7 5z" fill="currentColor" />
          </svg>
          <span>Connect Antigravity Account</span>
        </div>

        {/* Login Method Tabs */}
        <div className="modal-tab-bar">
          <button
            className={`modal-tab ${activeTab === "capture" ? "modal-tab--active" : ""}`}
            onClick={() => handleTabSwitch("capture")}
            data-tooltip="Capture active Antigravity session from running IDE"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="9" height="9">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="currentColor" stroke-width="1.8" />
              <path
                d="M19 4h-3.17L14.2 2H9.8L8.17 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"
                stroke="currentColor"
                stroke-width="1.8"
              />
            </svg>
            Capture Session
          </button>
          <button
            className={`modal-tab ${activeTab === "browser" ? "modal-tab--active" : ""}`}
            onClick={() => handleTabSwitch("browser")}
            data-tooltip="Log in to Antigravity via browser/IDE sign in"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="9" height="9">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8" />
              <path
                d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                stroke="currentColor"
                stroke-width="1.8"
              />
            </svg>
            Browser Login
          </button>
        </div>

        {/* Capture Tab Panel */}
        {activeTab === "capture" && (
          <div>
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

            <div className="dialog-buttons" style={{ marginTop: "14px" }}>
              <button
                className="dialog-btn dialog-btn--cancel"
                onClick={handleCancelOauth}
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
            </div>
          </div>
        )}

        {/* Browser Tab Panel */}
        {activeTab === "browser" && (
          <div>
            <ol className="oauth-steps">
              <li className={`oauth-step ${oauthStep === 1 ? "oauth-step--active" : oauthStep > 1 ? "oauth-step--done" : ""}`}>
                <div className="oauth-step-num">1</div>
                <div className="oauth-step-body">
                  <div className="form-field" style={{ marginBottom: "8px" }}>
                    <label className="form-label" style={{ fontSize: "9px" }}>
                      Account Label Prefix
                    </label>
                    <input
                      ref={oauthLabelRef}
                      type="text"
                      className="form-input"
                      style={{ height: "24px", fontSize: "10.5px" }}
                      value={oauthLabel}
                      onChange={(e) => setOauthLabel(e.target.value)}
                    />
                  </div>
                  <p className="oauth-step-title">Start Login</p>
                  <p className="oauth-step-desc">
                    Clicking below will clear the current IDE session and guide you to log in.
                  </p>
                  <button
                    className={`oauth-open-btn ${oauthStep > 1 ? "oauth-open-btn--done" : ""} ${oauthLoading && oauthStep === 1 ? "loading" : ""}`}
                    onClick={handleStartBrowserLogin}
                    disabled={oauthStep > 1 || oauthLoading}
                    data-tooltip="Trigger Google/Antigravity Sign In sequence"
                  >
                    {oauthStep > 1 ? (
                      "✓ IDE Login Triggered"
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="11" height="11">
                          <path
                            d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                          />
                          <path d="M15 3h6v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                          <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                        </svg>
                        Log in with Antigravity
                      </>
                    )}
                  </button>
                </div>
              </li>
              <li className={`oauth-step ${oauthStep === 2 ? "oauth-step--active" : oauthStep > 2 ? "oauth-step--done" : ""}`}>
                <div className="oauth-step-num">2</div>
                <div className="oauth-step-body">
                  <p className="oauth-step-title">Complete Login in IDE</p>
                  <p className="oauth-step-desc">
                    Click Sign In inside your IDE and log in through the browser. We'll capture it automatically when you're done.
                  </p>
                </div>
              </li>
              <li className={`oauth-step ${oauthStep === 3 ? "oauth-step--active" : ""}`}>
                <div className="oauth-step-num">3</div>
                <div className="oauth-step-body">
                  <p className="oauth-step-title">Success!</p>
                  <p className="oauth-step-desc">Your Antigravity session is captured successfully.</p>
                </div>
              </li>
            </ol>

            {oauthStatusText && (
              <div className={`oauth-validate-row ${oauthStatusType === "error" ? "oauth-validate-row--error" : oauthStatusType === "success" ? "oauth-validate-row--success" : ""}`}>
                {oauthLoading && <div className="oauth-spinner" />}
                <span className="oauth-validate-text">{oauthStatusText}</span>
              </div>
            )}

            <div className="dialog-buttons" style={{ marginTop: "12px" }}>
              <button
                className="dialog-btn dialog-btn--cancel"
                onClick={handleCancelOauth}
                data-tooltip="Cancel browser login and close dialog"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
