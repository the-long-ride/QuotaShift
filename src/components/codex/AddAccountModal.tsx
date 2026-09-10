import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { obfuscate, deobfuscate, decodeJwtEmail, decodeJwtProfile } from "../../utils/auth/auth";
import { CodexAccount } from "../../utils/common/types";
import { AccountModalLayout } from "../common/AccountModalLayout";
import { CodexApiKeyTab } from "./CodexApiKeyTab";
import { CodexBrowserLoginTab } from "./CodexBrowserLoginTab";
import { CodexLocalSessionTab } from "./CodexLocalSessionTab";

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountAdded: (accountId: string) => void;
  showAlert: (msg: string) => Promise<void>;
  loadAccounts: () => CodexAccount[];
  saveAccounts: (accounts: CodexAccount[]) => void;
  onStartFetching: (accountId: string, isOAuth: boolean) => void;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen, onClose, onAccountAdded, showAlert, loadAccounts, saveAccounts, onStartFetching,
}) => {
  const [activeTab, setActiveTab] = useState<"apikey" | "browser" | "local">("browser");
  const [apiKeyLabel, setApiKeyLabel] = useState("");
  const [apiKeyVal, setApiKeyVal] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [oauthStep, setOauthStep] = useState<1 | 2 | 3>(1);
  const [oauthLabel, setOauthLabel] = useState("ChatGPT");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthStatusText, setOauthStatusText] = useState("");
  const [oauthStatusType, setOauthStatusType] = useState<"normal" | "error" | "success">("normal");
  const [localLabel, setLocalLabel] = useState("Codex CLI");
  const [localErrorText, setLocalErrorText] = useState<string | null>(null);

  const labelInputRef = useRef<HTMLInputElement>(null);
  const browserLabelRef = useRef<HTMLInputElement>(null);
  const localLabelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setApiKeyLabel(""); setApiKeyVal(""); setShowApiKey(false);
    setOauthStep(1); setOauthLabel("ChatGPT"); setOauthLoading(false);
    setOauthStatusText(""); setOauthStatusType("normal");
    setLocalLabel("Codex CLI"); setLocalErrorText(null); setActiveTab("browser");
    setTimeout(() => browserLabelRef.current?.focus(), 100);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      const u = await listen<{ code?: string; error?: string }>("oauth-callback", async (event) => {
        const { code, error } = event.payload;
        if (error) {
          setOauthStatusType("error"); setOauthStatusText(`Login failed: ${error}`); setOauthLoading(false);
          return;
        }
        if (!code) {
          setOauthStatusType("error"); setOauthStatusText("No authorization code returned."); setOauthLoading(false);
          return;
        }

        setOauthStep(3); setOauthStatusType("normal"); setOauthStatusText("Exchanging code for tokens..."); setOauthLoading(true);

        try {
          const tokenJson = await invoke<any>("exchange_oauth_token", { code });
          const accessToken = tokenJson.access_token;
          const refreshToken = tokenJson.refresh_token;

          if (!accessToken) {
            setOauthStatusType("error"); setOauthStatusText("Failed to obtain access token."); setOauthLoading(false);
            return;
          }

          setOauthStatusText("Retrieving your ChatGPT workspaces...");
          const accountsResponse = await invoke<any>("fetch_chatgpt_workspaces", { accessToken });
          const items = accountsResponse.items || [];

          if (items.length === 0) {
            setOauthStatusType("error"); setOauthStatusText("No ChatGPT workspaces found on your account."); setOauthLoading(false);
            return;
          }

          const accounts = loadAccounts();
          const labelPrefix = oauthLabel.trim() || "ChatGPT";
          let lastAccountId: string | null = null;

          items.forEach((item: any) => {
            const workspaceName = item.name || "Personal";
            const accountLabel = items.length > 1 ? `${labelPrefix} (${workspaceName})` : labelPrefix;
            const oauthData = { accessToken, refreshToken, accountId: item.id, idToken: tokenJson.id_token || null, isOAuth: true };
            const profile = decodeJwtProfile(tokenJson.id_token);
            const newAccount: CodexAccount = {
              id: `acct-oauth-${item.id}`,
              label: accountLabel,
              apiKey: obfuscate(JSON.stringify(oauthData)),
              email: profile?.email || decodeJwtEmail(tokenJson.id_token) || undefined,
              profileUrl: profile?.picture ? obfuscate(profile.picture) : undefined,
            };

            const existingAccount = accounts.find((a) => a.id === newAccount.id);
            const filtered = accounts.filter((a) => a.id !== newAccount.id);
            filtered.push(existingAccount ? { ...existingAccount, ...newAccount } : newAccount);

            accounts.length = 0;
            accounts.push(...filtered);
            lastAccountId = newAccount.id;
          });

          saveAccounts(accounts);
          if (lastAccountId) onStartFetching(lastAccountId, true);
          setOauthStatusType("success"); setOauthStatusText("✓ Connected successfully!"); setOauthLoading(false);

          setTimeout(() => {
            onClose();
            if (lastAccountId) onAccountAdded(lastAccountId);
          }, 1000);
        } catch (err: any) {
          setOauthStatusType("error"); setOauthStatusText(err?.message ?? String(err)); setOauthLoading(false);
        }
      });

      if (!active) u(); else unlistenFn = u;
    };

    setupListener();
    return () => {
      active = false;
      if (unlistenFn) unlistenFn();
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

  const handleConnectApiKey = async () => {
    const label = apiKeyLabel.trim();
    const apiKey = apiKeyVal.trim();
    if (!label) { labelInputRef.current?.focus(); return; }
    if (!apiKey || !apiKey.startsWith("sk-")) {
      await showAlert("API key must start with 'sk-'. Find your key at platform.openai.com/account/api-keys");
      return;
    }
    const accounts = loadAccounts();
    const newAccount: CodexAccount = { id: `acct-apikey-${Date.now()}`, label, apiKey: obfuscate(apiKey) };
    accounts.push(newAccount);
    saveAccounts(accounts);
    onStartFetching(newAccount.id, false);
    onClose();
    onAccountAdded(newAccount.id);
  };

  const handleStartBrowserLogin = async () => {
    setOauthStatusType("normal"); setOauthStatusText("");
    try {
      setOauthLoading(true);
      const authUrl = await invoke<string>("start_oauth_flow");
      openUrl(authUrl);
      setOauthStep(2); setOauthStatusText("Awaiting callback from browser...");
    } catch (err: any) {
      setOauthLoading(false); setOauthStatusType("error"); setOauthStatusText(err?.message ?? String(err));
    }
  };

  const handleCopyLoginLink = async () => {
    setOauthStatusType("normal"); setOauthStatusText("");
    try {
      setOauthLoading(true);
      const authUrl = await invoke<string>("start_oauth_flow");
      await navigator.clipboard.writeText(authUrl);
      setOauthStep(2); setOauthStatusType("success");
      setOauthStatusText("✓ Link copied! Paste and authenticate in your browser, then we'll automatically redirect back.");
    } catch (err: any) {
      setOauthLoading(false); setOauthStatusType("error"); setOauthStatusText(err?.message ?? String(err));
    }
  };

  const handleResetSession = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await invoke("reset_oauth_session");
      setOauthStep(1); setOauthLoading(false); setOauthStatusText(""); setOauthStatusType("normal");
    } catch (err: any) {
      await showAlert("Failed to reset session: " + err);
    }
  };

  const handleLocalImport = async () => {
    const label = localLabel.trim();
    if (!label) { localLabelRef.current?.focus(); return; }
    setLocalErrorText(null);
    try {
      const rawAuth = await invoke<string | null>("read_codex_auth");
      if (!rawAuth) {
        setLocalErrorText("No Codex CLI session found at ~/.codex/auth.json. Log in via CLI first.");
        return;
      }
      const authData = JSON.parse(rawAuth);
      if (!authData) { setLocalErrorText("Failed to parse auth.json. The file is empty or invalid."); return; }

      let importedAccount: CodexAccount | null = null;
      if (authData.auth_mode === "chatgpt" && authData.tokens?.access_token) {
        const tokens = authData.tokens;
        const oauthData = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, accountId: tokens.account_id, idToken: tokens.id_token, isOAuth: true };
        const accountId = tokens.account_id || `shared-${Date.now()}`;
        const profile = decodeJwtProfile(tokens.id_token);
        const email = profile?.email || decodeJwtEmail(tokens.id_token);
        importedAccount = { id: `acct-oauth-${accountId}`, label, apiKey: obfuscate(JSON.stringify(oauthData)), email: email || undefined, profileUrl: profile?.picture ? obfuscate(profile.picture) : undefined };
      } else if (authData.auth_mode === "openai_api_key" && authData.OPENAI_API_KEY) {
        const apiKey = authData.OPENAI_API_KEY;
        const suffix = apiKey.length > 6 ? apiKey.slice(-6) : `key-${Date.now()}`;
        importedAccount = { id: `acct-apikey-${suffix}`, label, apiKey: obfuscate(apiKey) };
      } else {
        setLocalErrorText("auth.json does not contain valid ChatGPT tokens or OpenAI API Key.");
        return;
      }

      if (importedAccount) {
        const accounts = loadAccounts();
        const existingIdx = accounts.findIndex((a) => a.id === importedAccount!.id || (importedAccount!.email && a.email === importedAccount!.email));
        if (existingIdx !== -1) {
          importedAccount.id = accounts[existingIdx].id;
          accounts[existingIdx] = importedAccount;
        } else {
          accounts.push(importedAccount);
        }
        saveAccounts(accounts);
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
          <button className="dialog-btn dialog-btn--cancel" onClick={onClose} data-tooltip="Cancel adding Codex account and close dialog">Cancel</button>
          <button className="dialog-btn" onClick={handleConnectApiKey} data-tooltip="Validate key and connect the account">Connect</button>
        </>
      );
    }
    if (activeTab === "browser") {
      return <button className="dialog-btn dialog-btn--cancel" onClick={onClose} data-tooltip="Cancel the browser login flow">Cancel</button>;
    }
    if (activeTab === "local") {
      return (
        <>
          <button className="dialog-btn dialog-btn--cancel" onClick={onClose} data-tooltip="Cancel importing local session">Cancel</button>
          <button className="dialog-btn" onClick={handleLocalImport} data-tooltip="Search and import active session from local files">Import Session</button>
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
      icon={<svg viewBox="0 0 24 24" fill="none" width="14" height="14" style={{ color: "var(--codex-accent)" }}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" /><path d="M9 9l6 3-6 3V9z" fill="currentColor" /></svg>}
      tabs={
        <div className="modal-tab-bar">
          <button className={`modal-tab ${activeTab === "browser" ? "modal-tab--active" : ""}`} onClick={() => handleTabSwitch("browser")} data-tooltip="Log in via browser to connect Codex account">
            <svg viewBox="0 0 24 24" fill="none" width="9" height="9"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="1.8" /></svg>
            Browser Login
          </button>
          <button className={`modal-tab ${activeTab === "apikey" ? "modal-tab--active" : ""}`} onClick={() => handleTabSwitch("apikey")} data-tooltip="Use an OpenAI API Key to connect Codex account">
            <svg viewBox="0 0 24 24" fill="none" width="9" height="9"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            API Key
          </button>
          <button className={`modal-tab ${activeTab === "local" ? "modal-tab--active" : ""}`} onClick={() => handleTabSwitch("local")} data-tooltip="Import Codex CLI local auth file session">
            <svg viewBox="0 0 24 24" fill="none" width="9" height="9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.8" /><path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" /></svg>
            Local Session
          </button>
        </div>
      }
      footerButtons={renderFooterButtons()}
    >
      {activeTab === "apikey" && (
        <CodexApiKeyTab
          labelInputRef={labelInputRef}
          apiKeyLabel={apiKeyLabel}
          setApiKeyLabel={setApiKeyLabel}
          apiKeyVal={apiKeyVal}
          setApiKeyVal={setApiKeyVal}
          showApiKey={showApiKey}
          setShowApiKey={setShowApiKey}
          onConnect={handleConnectApiKey}
        />
      )}
      {activeTab === "browser" && (
        <CodexBrowserLoginTab
          browserLabelRef={browserLabelRef}
          oauthStep={oauthStep}
          oauthLabel={oauthLabel}
          setOauthLabel={setOauthLabel}
          oauthLoading={oauthLoading}
          oauthStatusText={oauthStatusText}
          oauthStatusType={oauthStatusType}
          onStartBrowserLogin={handleStartBrowserLogin}
          onCopyLoginLink={handleCopyLoginLink}
          onResetSession={handleResetSession}
        />
      )}
      {activeTab === "local" && (
        <CodexLocalSessionTab
          localLabelRef={localLabelRef}
          localLabel={localLabel}
          setLocalLabel={setLocalLabel}
          localErrorText={localErrorText}
          onImport={handleLocalImport}
        />
      )}
    </AccountModalLayout>
  );
};
