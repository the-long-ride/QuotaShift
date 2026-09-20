import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { obfuscate, deobfuscate, decodeJwtEmail, decodeJwtProfile } from "../../utils/auth/auth";
import { resolveCodexLoginPicture } from "./codex-login-profile";
import type { CodexAccount } from "../../utils/common/types";
import { AccountModalLayout } from "../common/AccountModalLayout";
import { useCloseOnEscape } from "../common/useCloseOnEscape";
import { CodexApiKeyTab } from "./CodexApiKeyTab";
import { CodexBrowserLoginTab } from "./CodexBrowserLoginTab";
import { CodexLocalSessionTab } from "./CodexLocalSessionTab";
import { CodexModalHeaderIcon, CodexModalTabs } from "./CodexModalTabs";
import { CodexModalFooter } from "./CodexModalFooter";
import { createApiKeyCodexAccount, importLocalCodexSession } from "./codex-add-account-helpers";
import { useCodexBrowserOAuth } from "./useCodexBrowserOAuth";

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountsAdded: (accountIds: string[]) => void;
  onAccountAdded?: (accountId: string) => void;
  showAlert: (msg: string) => Promise<void>;
  loadAccounts: () => CodexAccount[];
  saveAccounts: (accounts: CodexAccount[]) => void;
  onStartFetching: (accountId: string, isOAuth: boolean) => void;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountsAdded,
  showAlert,
  loadAccounts,
  saveAccounts,
  onStartFetching,
}) => {
  const [activeTab, setActiveTab] = useState<"apikey" | "browser" | "local">("browser");
  const [apiKeyLabel, setApiKeyLabel] = useState("");
  const [apiKeyVal, setApiKeyVal] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [localLabel, setLocalLabel] = useState("Codex CLI");
  const [localErrorText, setLocalErrorText] = useState<string | null>(null);

  const labelInputRef = useRef<HTMLInputElement>(null);
  const localLabelRef = useRef<HTMLInputElement>(null);

  const {
    oauthStep,
    setOauthStep,
    oauthLoading,
    setOauthLoading,
    oauthStatusText,
    setOauthStatusText,
    oauthStatusType,
    setOauthStatusType,
    resetOAuth,
    handleStartBrowserLogin,
    handleCopyLoginLink,
    handleResetSession,
  } = useCodexBrowserOAuth(showAlert);

  useEffect(() => {
    if (!isOpen) return;
    setApiKeyLabel("");
    setApiKeyVal("");
    setShowApiKey(false);
    resetOAuth();
    setLocalLabel("Codex CLI");
    setLocalErrorText(null);
    setActiveTab("browser");
  }, [isOpen]);

  useCloseOnEscape(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      const u = await listen<{ code?: string; error?: string }>("oauth-callback", async (event) => {
        const { code, error } = event.payload;
        if (error || !code) {
          setOauthStatusType("error");
          setOauthStatusText(error ? `Login failed: ${error}` : "No authorization code returned.");
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
          const profile = decodeJwtProfile(tokenJson.id_token);
          const email = profile?.email || decodeJwtEmail(tokenJson.id_token) || undefined;
          const profileName = profile?.name?.trim();
          const profilePicture = await resolveCodexLoginPicture(
            accessToken,
            tokenJson.id_token,
            accountsResponse,
          );
          const emailLocalPart = email?.split("@")[0]?.trim();
          const baseLabel = profileName || emailLocalPart || "ChatGPT";
          const accountIds: string[] = [];

          items.forEach((item: any) => {
            const accountId = `acct-oauth-${item.id}`;
            const existingAccount = accounts.find((a) => a.id === accountId);
            const workspaceName = item.name?.trim() || "Personal";
            const derivedLabel = items.length > 1 ? `${baseLabel} (${workspaceName})` : baseLabel;
            const accountLabel = existingAccount?.label?.trim() || derivedLabel;
            const oauthData = {
              accessToken,
              refreshToken,
              accountId: item.id,
              idToken: tokenJson.id_token || null,
              isOAuth: true,
            };
            const newAccount: CodexAccount = {
              id: accountId,
              label: accountLabel,
              apiKey: obfuscate(JSON.stringify(oauthData)),
              email,
              profileUrl: profilePicture ? obfuscate(profilePicture) : existingAccount?.profileUrl,
            };

            const filtered = accounts.filter((a) => a.id !== newAccount.id);
            filtered.push(existingAccount ? { ...existingAccount, ...newAccount } : newAccount);

            accounts.length = 0;
            accounts.push(...filtered);
            accountIds.push(newAccount.id);
          });

          saveAccounts(accounts);
          accountIds.forEach((id) => onStartFetching(id, true));
          setOauthStatusType("success");
          setOauthStatusText("✓ Connected successfully!");
          setOauthLoading(false);

          setTimeout(() => {
            onClose();
            onAccountsAdded(accountIds);
          }, 1000);
        } catch (err: any) {
          setOauthStatusType("error");
          setOauthStatusText(err?.message ?? String(err));
          setOauthLoading(false);
        }
      });

      if (!active) u();
      else unlistenFn = u;
    };

    setupListener();
    return () => {
      active = false;
      if (unlistenFn) unlistenFn();
      invoke("reset_oauth_session").catch(console.error);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTabSwitch = (tab: "apikey" | "browser" | "local") => {
    setActiveTab(tab);
    setTimeout(() => {
      if (tab === "apikey") labelInputRef.current?.focus();
      else if (tab === "local") localLabelRef.current?.focus();
    }, 100);
  };

  const handleConnectApiKey = async () => {
    const label = apiKeyLabel.trim();
    const apiKey = apiKeyVal.trim();
    if (!label) {
      labelInputRef.current?.focus();
      return;
    }
    if (!apiKey || !apiKey.startsWith("sk-")) {
      await showAlert(
        "API key must start with 'sk-'. Find your key at platform.openai.com/account/api-keys",
      );
      return;
    }
    const accounts = loadAccounts();
    const newAccount = createApiKeyCodexAccount(label, apiKey);
    accounts.push(newAccount);
    saveAccounts(accounts);
    onStartFetching(newAccount.id, false);
    onClose();
    onAccountsAdded([newAccount.id]);
  };

  const handleLocalImport = async () => {
    const label = localLabel.trim();
    if (!label) {
      localLabelRef.current?.focus();
      return;
    }
    setLocalErrorText(null);
    try {
      const result = await importLocalCodexSession(label, loadAccounts, saveAccounts);
      if (result.error) {
        setLocalErrorText(result.error);
        return;
      }
      if (result.account) {
        onStartFetching(result.account.id, deobfuscate(result.account.apiKey).startsWith("{"));
        onClose();
        onAccountsAdded([result.account.id]);
      }
    } catch (err: any) {
      setLocalErrorText(`Import failed: ${err?.message ?? String(err)}`);
    }
  };

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title="Connect Codex Account"
      icon={<CodexModalHeaderIcon />}
      tabs={<CodexModalTabs activeTab={activeTab} onTabSwitch={handleTabSwitch} />}
      footerButtons={
        <CodexModalFooter
          activeTab={activeTab}
          onClose={onClose}
          onConnectApiKey={handleConnectApiKey}
          onLocalImport={handleLocalImport}
        />
      }
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
          oauthStep={oauthStep}
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
