import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { obfuscate } from "../../../utils/auth/auth";
import { resolveCodexLoginPicture } from "../siwc/codex-login-profile";
import { authorizeModelRoutingAfterCodexLogin } from "../siwc/codex-siwc-login";
import type { CodexAccount } from "../../../utils/common/types";
import { AccountModalLayout } from "../../common/accounts/AccountModalLayout";
import { useCloseOnEscape } from "../../common/dialogs/useCloseOnEscape";
import { CodexApiKeyTab } from "./CodexApiKeyTab";
import { CodexBrowserLoginTab } from "./CodexBrowserLoginTab";
import { CodexLocalSessionTab } from "./CodexLocalSessionTab";
import { CodexModalHeaderIcon, CodexModalTabs } from "./CodexModalTabs";
import { CodexModalFooter } from "./CodexModalFooter";
import { executeCodexLocalSessionImport } from "../siwc/codex-add-account-helpers";
import { useCodexBrowserOAuth } from "../siwc/useCodexBrowserOAuth";
import type { ToastKind } from "../../common/Toast";
import {
  codexProfileMeta,
  exchangeAndDiscoverWorkspaces,
  findExistingWorkspaceAccount,
  formatSkippedWorkspacesNotice,
  validateAndBuildApiKeyAccount,
} from "./codex-oauth-accounts";

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountsAdded: (accountIds: string[]) => void;
  onAccountAdded?: (accountId: string) => void;
  showAlert: (msg: string) => Promise<void>;
  loadAccounts: () => CodexAccount[];
  saveAccounts: (accounts: CodexAccount[]) => void;
  onStartFetching: (accountId: string, isOAuth: boolean) => void;
  showToast: (message: string, kind?: ToastKind) => void;
  reauthAccount?: CodexAccount | null;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountsAdded,
  showAlert,
  loadAccounts,
  saveAccounts,
  onStartFetching,
  showToast,
  reauthAccount,
}) => {
  const [activeTab, setActiveTab] = useState<"apikey" | "browser" | "local">("browser");
  const [enableModelRouting, setEnableModelRouting] = useState(true);
  const enableModelRoutingRef = useRef(true);
  const [apiKeyLabel, setApiKeyLabel] = useState("");
  const [apiKeyVal, setApiKeyVal] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [localLabel, setLocalLabel] = useState("");
  const [localErrorText, setLocalErrorText] = useState<string | null>(null);

  const labelInputRef = useRef<HTMLInputElement>(null);
  const localLabelRef = useRef<HTMLInputElement>(null);
  const browserOAuth = useCodexBrowserOAuth(showAlert);

  useEffect(() => {
    if (!isOpen) return;
    setApiKeyLabel("");
    setApiKeyVal("");
    setShowApiKey(false);
    browserOAuth.resetOAuth();
    setLocalLabel("");
    setLocalErrorText(null);
    setActiveTab("browser");
    setEnableModelRouting(true);
    enableModelRoutingRef.current = true;
  }, [isOpen]);

  useCloseOnEscape(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    let unlistenFn: (() => void) | null = null;

    const failOAuth = (message: string) => {
      browserOAuth.setOauthStatusType("error");
      browserOAuth.setOauthStatusText(message);
      browserOAuth.setOauthLoading(false);
    };

    const setupListener = async () => {
      const u = await listen<{ code?: string; error?: string }>("oauth-callback", async (event) => {
        const { code, error } = event.payload;
        if (error || !code) {
          failOAuth(error ? `Login failed: ${error}` : "No authorization code returned.");
          return;
        }

        browserOAuth.setOauthStep(3);
        browserOAuth.setOauthStatusType("normal");
        browserOAuth.setOauthStatusText("Exchanging code for tokens...");
        browserOAuth.setOauthLoading(true);

        try {
          const discovered = await exchangeAndDiscoverWorkspaces(
            code,
            browserOAuth.setOauthStatusText,
          );
          if (!discovered.ok) {
            failOAuth(discovered.error);
            return;
          }

          const { session } = discovered;
          const { profile, email, connected, skipped } = session;
          const accounts = loadAccounts();
          const profilePicture = await resolveCodexLoginPicture(
            session.accessToken,
            session.idToken,
            session.accountsResponse,
          );
          const emailLocalPart = email?.split("@")[0]?.trim();
          const baseLabel = profile?.name?.trim() || emailLocalPart || "ChatGPT";
          const accountIds: string[] = [];

          connected.forEach((item) => {
            const accountId = `acct-oauth-${item.id}`;
            const allowSharedUpgrade =
              connected.length === 1 || item.id === session.authClaims?.chatgptAccountId;
            const existingAccount = findExistingWorkspaceAccount(
              accounts,
              accountId,
              item.id,
              email,
              allowSharedUpgrade,
            );
            const workspaceName = item.name?.trim() || "Personal";
            const derivedLabel =
              session.discoveredItems.length > 1 ? `${baseLabel} (${workspaceName})` : baseLabel;
            const accountLabel = existingAccount?.label?.trim() || derivedLabel;
            const oauthData = {
              accessToken: session.accessToken,
              refreshToken: session.refreshToken,
              accountId: item.id,
              idToken: session.idToken,
              isOAuth: true,
              lastRefresh: new Date().toISOString(),
            };
            const newAccount: CodexAccount = {
              id: accountId,
              label: accountLabel,
              apiKey: obfuscate(JSON.stringify(oauthData)),
              email,
              profileUrl: profilePicture ? obfuscate(profilePicture) : existingAccount?.profileUrl,
              ...codexProfileMeta(item, workspaceName),
            };

            const filtered = accounts.filter(
              (a) => a.id !== newAccount.id && a.id !== existingAccount?.id,
            );
            filtered.push(existingAccount ? { ...existingAccount, ...newAccount } : newAccount);

            accounts.length = 0;
            accounts.push(...filtered);
            accountIds.push(newAccount.id);
          });

          saveAccounts(accounts);
          accountIds.forEach((id) => onStartFetching(id, true));
          browserOAuth.setOauthStatusType("success");
          browserOAuth.setOauthStatusText("✓ Connected successfully!");
          browserOAuth.setOauthLoading(false);

          const skippedNotice = formatSkippedWorkspacesNotice(connected, skipped);
          if (skippedNotice) showToast(skippedNotice, "info");

          const newCodexAccount = accounts.find((account) => account.id === accountIds[0]);
          const requestRoutingConsent = !reauthAccount && enableModelRoutingRef.current;
          setTimeout(() => {
            onClose();
            onAccountsAdded(accountIds);
            if (requestRoutingConsent && newCodexAccount) {
              void authorizeModelRoutingAfterCodexLogin(newCodexAccount, showToast);
            }
          }, 1000);
        } catch (err: any) {
          failOAuth(err?.message ?? String(err));
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
    const result = validateAndBuildApiKeyAccount(apiKeyLabel, apiKeyVal);
    if (!result.ok) {
      if (result.focusLabel) labelInputRef.current?.focus();
      if (result.alertMessage) await showAlert(result.alertMessage);
      return;
    }
    const accounts = loadAccounts();
    accounts.push(result.account);
    saveAccounts(accounts);
    onStartFetching(result.account.id, false);
    onClose();
    onAccountsAdded([result.account.id]);
  };

  const handleLocalImport = () =>
    executeCodexLocalSessionImport({
      label: localLabel,
      loadAccounts,
      saveAccounts,
      onStartFetching,
      onAccountsAdded,
      onClose,
      showToast,
      setLocalErrorText,
    });

  const modalTitle = reauthAccount ? "Re-authenticate Codex account" : "Connect Codex Account";

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
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
          oauthStep={browserOAuth.oauthStep}
          oauthLoading={browserOAuth.oauthLoading}
          oauthStatusText={browserOAuth.oauthStatusText}
          oauthStatusType={browserOAuth.oauthStatusType}
          onStartBrowserLogin={browserOAuth.handleStartBrowserLogin}
          onCopyLoginLink={browserOAuth.handleCopyLoginLink}
          onResetSession={browserOAuth.handleResetSession}
          reauthAccount={reauthAccount}
          enableModelRouting={enableModelRouting}
          onToggleModelRouting={() => {
            enableModelRoutingRef.current = !enableModelRoutingRef.current;
            setEnableModelRouting(enableModelRoutingRef.current);
          }}
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
