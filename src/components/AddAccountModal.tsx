import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { obfuscate, deobfuscate, decodeJwtEmail } from "../utils/auth";
import { CodexAccount } from "../utils/types";
import { AccountModalLayout } from "./AccountModalLayout";

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountAdded: (accountId: string) => void;
  showAlert: (msg: string) => Promise<void>;
  loadAccounts: () => CodexAccount[];
  saveAccounts: (accounts: CodexAccount[]) => void;
  setActiveAccountId: (id: string) => void;
  onStartFetching: (accountId: string, isOAuth: boolean) => void;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountAdded,
  showAlert,
  loadAccounts,
  saveAccounts,
  setActiveAccountId,
  onStartFetching,
}) => {
  const [activeTab, setActiveTab] = useState<"apikey" | "browser" | "local">("apikey");

  // API Key state
  const [apiKeyLabel, setApiKeyLabel] = useState("");
  const [apiKeyVal, setApiKeyVal] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // Browser Login state
  const [oauthStep, setOauthStep] = useState<1 | 2 | 3>(1);
  const [oauthLabel, setOauthLabel] = useState("ChatGPT");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthStatusText, setOauthStatusText] = useState("");
  const [oauthStatusType, setOauthStatusType] = useState<"normal" | "error" | "success">("normal");

  // Local Session state
  const [localLabel, setLocalLabel] = useState("Codex CLI");
  const [localErrorText, setLocalErrorText] = useState<string | null>(null);

  const labelInputRef = useRef<HTMLInputElement>(null);
  const browserLabelRef = useRef<HTMLInputElement>(null);
  const localLabelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Reset fields on open
    setApiKeyLabel("");
    setApiKeyVal("");
    setShowApiKey(false);
    setOauthStep(1);
    setOauthLabel("ChatGPT");
    setOauthLoading(false);
    setOauthStatusText("");
    setOauthStatusType("normal");
    setLocalLabel("Codex CLI");
    setLocalErrorText(null);
    setActiveTab("apikey");

    // Focus
    setTimeout(() => {
      labelInputRef.current?.focus();
    }, 100);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    // Set up Tauri OAuth callback listener
    let active = true;
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      const u = await listen<{ code?: string; error?: string }>("oauth-callback", async (event) => {
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
        setOauthStatusText("Exchanging code for tokens...");
        setOauthLoading(true);

        try {
          const tokenJson = await invoke<any>("exchange_oauth_token", { code });
          const accessToken = tokenJson.access_token;
          const refreshToken = tokenJson.refresh_token;

          if (!accessToken) {
            setOauthStatusType("error");
            setOauthStatusText("Failed to obtain access token.");
            setOauthLoading(false);
            return;
          }

          setOauthStatusText("Retrieving your ChatGPT workspaces...");
          const accountsResponse = await invoke<any>("fetch_chatgpt_workspaces", { accessToken });
          const items = accountsResponse.items || [];

          if (items.length === 0) {
            setOauthStatusType("error");
            setOauthStatusText("No ChatGPT workspaces found on your account.");
            setOauthLoading(false);
            return;
          }

          const accounts = loadAccounts();
          const labelPrefix = oauthLabel.trim() || "ChatGPT";

          let lastAccountId: string | null = null;
          items.forEach((item: any) => {
            const workspaceName = item.name || "Personal";
            const accountLabel = items.length > 1 ? `${labelPrefix} (${workspaceName})` : labelPrefix;

            const oauthData = {
              accessToken,
              refreshToken,
              accountId: item.id,
              idToken: tokenJson.id_token || null,
              isOAuth: true,
            };

            const newAccount: CodexAccount = {
              id: `acct-oauth-${item.id}`,
              label: accountLabel,
              apiKey: obfuscate(JSON.stringify(oauthData)),
            };

            const filtered = accounts.filter((a) => a.id !== newAccount.id);
            filtered.push(newAccount);

            accounts.length = 0;
            accounts.push(...filtered);

            lastAccountId = newAccount.id;
          });

          saveAccounts(accounts);
          if (lastAccountId) {
            setActiveAccountId(lastAccountId);
            onStartFetching(lastAccountId, true);
          }

          setOauthStatusType("success");
          setOauthStatusText("✓ Connected successfully!");
          setOauthLoading(false);

          setTimeout(() => {
            onClose();
            if (lastAccountId) onAccountAdded(lastAccountId);
          }, 1000);
        } catch (err: any) {
          setOauthStatusType("error");
          setOauthStatusText(err?.message ?? String(err));
          setOauthLoading(false);
        }
      });

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
      // Free port when unmounting
      invoke("reset_oauth_session").catch(console.error);
    };
  }, [isOpen, oauthLabel]);

  if (!isOpen) return null;

  const handleTabSwitch = (tab: "apikey" | "browser" | "local") => {
    setActiveTab(tab);
    setTimeout(() => {
      if (tab === "apikey") labelInputRef.current?.focus();
      else if (tab === "browser") browserLabelRef.current?.focus();
      else if (tab === "local") localLabelRef.current?.focus();
    }, 100);
  };

  // API Key submission
  const handleConnectApiKey = async () => {
    const label = apiKeyLabel.trim();
    const apiKey = apiKeyVal.trim();

    if (!label) {
      labelInputRef.current?.focus();
      return;
    }
    if (!apiKey || !apiKey.startsWith("sk-")) {
      await showAlert("API key must start with 'sk-'. Find your key at platform.openai.com/account/api-keys");
      return;
    }

    const accounts = loadAccounts();
    const newAccount: CodexAccount = {
      id: `acct-apikey-${Date.now()}`,
      label,
      apiKey: obfuscate(apiKey),
    };
    accounts.push(newAccount);
    saveAccounts(accounts);
    setActiveAccountId(newAccount.id);
    onStartFetching(newAccount.id, false);

    onClose();
    onAccountAdded(newAccount.id);
  };

  // Start Browser Login
  const handleStartBrowserLogin = async () => {
    setOauthStatusType("normal");
    setOauthStatusText("");
    try {
      setOauthLoading(true);
      const authUrl = await invoke<string>("start_oauth_flow");
      openUrl(authUrl);

      setOauthStep(2);
      setOauthStatusText("Awaiting callback from browser...");
    } catch (err: any) {
      setOauthLoading(false);
      const errMsg = err?.message ?? String(err);
      setOauthStatusType("error");
      setOauthStatusText(errMsg);
    }
  };

  // Copy OAuth Login Link
  const handleCopyLoginLink = async () => {
    setOauthStatusType("normal");
    setOauthStatusText("");
    try {
      setOauthLoading(true);
      const authUrl = await invoke<string>("start_oauth_flow");
      await navigator.clipboard.writeText(authUrl);

      setOauthStep(2);
      setOauthStatusType("success");
      setOauthStatusText("✓ Link copied! Paste and authenticate in your browser, then we'll automatically redirect back.");
    } catch (err: any) {
      setOauthLoading(false);
      const errMsg = err?.message ?? String(err);
      setOauthStatusType("error");
      setOauthStatusText(errMsg);
    }
  };

  // Reset session helper
  const handleResetSession = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await invoke("reset_oauth_session");
      setOauthStep(1);
      setOauthLoading(false);
      setOauthStatusText("");
      setOauthStatusType("normal");
    } catch (err: any) {
      await showAlert("Failed to reset session: " + err);
    }
  };

  // Local Import
  const handleLocalImport = async () => {
    const label = localLabel.trim();
    if (!label) {
      localLabelRef.current?.focus();
      return;
    }

    setLocalErrorText(null);
    try {
      const rawAuth = await invoke<string | null>("read_codex_auth");
      if (!rawAuth) {
        setLocalErrorText("No Codex CLI session found at ~/.codex/auth.json. Log in via CLI first.");
        return;
      }

      const authData = JSON.parse(rawAuth);
      if (!authData) {
        setLocalErrorText("Failed to parse auth.json. The file is empty or invalid.");
        return;
      }

      let importedAccount: CodexAccount | null = null;

      if (authData.auth_mode === "chatgpt" && authData.tokens && authData.tokens.access_token) {
        const tokens = authData.tokens;
        const oauthData = {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          accountId: tokens.account_id,
          idToken: tokens.id_token,
          isOAuth: true,
        };
        const accountId = tokens.account_id || `shared-${Date.now()}`;
        const email = decodeJwtEmail(tokens.id_token);
        importedAccount = {
          id: `acct-oauth-${accountId}`,
          label,
          apiKey: obfuscate(JSON.stringify(oauthData)),
          email: email || undefined,
        };
      } else if (authData.auth_mode === "openai_api_key" && authData.OPENAI_API_KEY) {
        const apiKey = authData.OPENAI_API_KEY;
        const suffix = apiKey.length > 6 ? apiKey.slice(-6) : `key-${Date.now()}`;
        importedAccount = {
          id: `acct-apikey-${suffix}`,
          label,
          apiKey: obfuscate(apiKey),
        };
      } else {
        setLocalErrorText("auth.json does not contain valid ChatGPT tokens or OpenAI API Key.");
        return;
      }

      if (importedAccount) {
        const accounts = loadAccounts();
        const existingIdx = accounts.findIndex(
          (a) =>
            a.id === importedAccount!.id || (importedAccount!.email && a.email === importedAccount!.email)
        );
        if (existingIdx !== -1) {
          importedAccount.id = accounts[existingIdx].id;
          accounts[existingIdx] = importedAccount;
        } else {
          accounts.push(importedAccount);
        }

        saveAccounts(accounts);
        setActiveAccountId(importedAccount.id);
        onStartFetching(importedAccount.id, deobfuscate(importedAccount.apiKey).startsWith("{"));

        onClose();
        onAccountAdded(importedAccount.id);
      }
    } catch (err: any) {
      setLocalErrorText(`Import failed: ${err?.message ?? String(err)}`);
    }
  };

  const renderFooterButtons = () => {
    if (activeTab === "apikey") {
      return (
        <>
          <button
            className="dialog-btn dialog-btn--cancel"
            onClick={onClose}
            data-tooltip="Cancel adding Codex account and close dialog"
          >
            Cancel
          </button>
          <button
            className="dialog-btn"
            onClick={handleConnectApiKey}
            data-tooltip="Validate key and connect the account"
          >
            Connect
          </button>
        </>
      );
    }
    if (activeTab === "browser") {
      return (
        <button
          className="dialog-btn dialog-btn--cancel"
          onClick={onClose}
          data-tooltip="Cancel the browser login flow"
        >
          Cancel
        </button>
      );
    }
    if (activeTab === "local") {
      return (
        <>
          <button
            className="dialog-btn dialog-btn--cancel"
            onClick={onClose}
            data-tooltip="Cancel importing local session"
          >
            Cancel
          </button>
          <button
            className="dialog-btn"
            onClick={handleLocalImport}
            data-tooltip="Search and import active session from local files"
          >
            Import Session
          </button>
        </>
      );
    }
    return null;
  };

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title="Connect Codex Account"
      icon={
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          style={{ color: "var(--codex-accent)" }}
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 9l6 3-6 3V9z" fill="currentColor" />
        </svg>
      }
      tabs={
        <div className="modal-tab-bar">
          <button
            className={`modal-tab ${activeTab === "apikey" ? "modal-tab--active" : ""}`}
            onClick={() => handleTabSwitch("apikey")}
            data-tooltip="Use an OpenAI API Key to connect Codex account"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="9" height="9">
              <path
                d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            API Key
          </button>
          <button
            className={`modal-tab ${activeTab === "browser" ? "modal-tab--active" : ""}`}
            onClick={() => handleTabSwitch("browser")}
            data-tooltip="Log in via browser to connect Codex account"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="9" height="9">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
            Browser Login
          </button>
          <button
            className={`modal-tab ${activeTab === "local" ? "modal-tab--active" : ""}`}
            onClick={() => handleTabSwitch("local")}
            data-tooltip="Import Codex CLI local auth file session"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="9" height="9">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            Local Session
          </button>
        </div>
      }
      footerButtons={renderFooterButtons()}
    >
      {/* API Key Panel */}
      {activeTab === "apikey" && (
        <div>
          <div className="account-form">
            <div className="form-field">
              <label className="form-label" htmlFor="label-input">
                Account Label
              </label>
              <input
                ref={labelInputRef}
                type="text"
                id="label-input"
                className="form-input"
                placeholder="e.g. Work Account"
                maxLength={32}
                value={apiKeyLabel}
                onChange={(e) => setApiKeyLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConnectApiKey();
                  }
                }}
              />
            </div>

            <div className="form-field" style={{ marginTop: "16px" }}>
              <label className="form-label" htmlFor="api-key-input">
                API Key
              </label>
              <div className="password-input-wrap">
                <input
                  type={showApiKey ? "text" : "password"}
                  id="api-key-input"
                  className="form-input"
                  placeholder="sk-..."
                  value={apiKeyVal}
                  onChange={(e) => setApiKeyVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleConnectApiKey();
                    }
                  }}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowApiKey(!showApiKey)}
                  data-tooltip={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      width="11"
                      height="11"
                    >
                      <path
                        d="M2 12c4-8 16-8 20 0-4 8-16 8-20 0z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      width="11"
                      height="11"
                    >
                      <path
                        d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="form-hint">Stored locally and never leaves your device.</p>
            </div>
          </div>
        </div>
      )}

      {/* Browser Login Panel */}
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
                    ref={browserLabelRef}
                    type="text"
                    className="form-input"
                    style={{ height: "24px", fontSize: "10.5px" }}
                    value={oauthLabel}
                    onChange={(e) => setOauthLabel(e.target.value)}
                  />
                </div>
                <p className="oauth-step-title">Start Login</p>
                <p className="oauth-step-desc">Click below to start ChatGPT login via your default browser.</p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    className={`oauth-open-btn ${oauthStep > 1 ? "oauth-open-btn--done" : ""} ${oauthLoading && oauthStep === 1 ? "loading" : ""}`}
                    onClick={handleStartBrowserLogin}
                    disabled={oauthStep > 1 || oauthLoading}
                    data-tooltip="Open ChatGPT.com login page in your browser"
                  >
                    {oauthStep > 1 ? (
                      "✓ Login page opened in browser"
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="11" height="11">
                          <path
                            d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                          <path d="M15 3h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        Log in with ChatGPT.com
                      </>
                    )}
                  </button>
                  {oauthStep === 1 && (
                    <button
                      className="oauth-copy-btn"
                      onClick={handleCopyLoginLink}
                      disabled={oauthLoading}
                      data-tooltip="Copy the ChatGPT.com login link to clipboard"
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="11" height="11">
                        <path
                          d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V8a2 2 0 00-2-2h-4M8 4a2 2 0 012-2h3m-5 4H5a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2v-2"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Copy Link
                    </button>
                  )}
                </div>
              </div>
            </li>
            <li className={`oauth-step ${oauthStep === 2 ? "oauth-step--active" : oauthStep > 2 ? "oauth-step--done" : ""}`}>
              <div className="oauth-step-num">2</div>
              <div className="oauth-step-body">
                <p className="oauth-step-title">Complete Login in Browser</p>
                <p className="oauth-step-desc">
                  Authenticate on the OpenAI page. When finished, it will automatically redirect back.
                </p>
              </div>
            </li>
            <li className={`oauth-step ${oauthStep === 3 ? "oauth-step--active" : ""}`}>
              <div className="oauth-step-num">3</div>
              <div className="oauth-step-body">
                <p className="oauth-step-title">Success!</p>
                <p className="oauth-step-desc">Your ChatGPT workspaces are connected successfully.</p>
              </div>
            </li>
          </ol>

          {/* Validation status info */}
          {oauthStatusText && (
            <div className={`oauth-validate-row ${oauthStatusType === "error" ? "oauth-validate-row--error" : oauthStatusType === "success" ? "oauth-validate-row--success" : ""}`}>
              {oauthLoading && <div className="oauth-spinner" />}
              <span className="oauth-validate-text">
                {oauthStatusText.includes("bind to port 1455") ? (
                  <>
                    {oauthStatusText}{" "}
                    <a
                      href="#"
                      onClick={handleResetSession}
                      style={{
                        color: "var(--text-primary)",
                        textDecoration: "underline",
                        marginLeft: "6px",
                        fontWeight: 600,
                      }}
                    >
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

      {/* Local Session Panel */}
      {activeTab === "local" && (
        <div>
          <div className="account-form" style={{ padding: "10px 0" }}>
            <p className="oauth-step-desc" style={{ marginBottom: "12px" }}>
              Import the active session currently logged in via the Codex CLI (
              <code style={{ background: "var(--border-color)", padding: "2px 4px", borderRadius: "3px" }}>
                ~/.codex/auth.json
              </code>
              ).
            </p>
            <div className="form-field" style={{ marginBottom: "12px" }}>
              <label className="form-label" htmlFor="local-label-input">
                Account Label
              </label>
              <input
                ref={localLabelRef}
                type="text"
                id="local-label-input"
                className="form-input"
                placeholder="e.g. Codex CLI"
                maxLength={32}
                value={localLabel}
                onChange={(e) => setLocalLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleLocalImport();
                  }
                }}
              />
            </div>
          </div>

          {localErrorText && (
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
              {localErrorText}
            </div>
          )}
        </div>
      )}
    </AccountModalLayout>
  );
};
