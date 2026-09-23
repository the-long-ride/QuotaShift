import React from "react";
import type {
  AntigravityAccount,
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
} from "../../utils/common/types";
import {
  loadAntigravityAccounts,
  saveAntigravityAccounts,
  loadCodexAccounts,
  saveCodexAccounts,
} from "../../utils/common/app-storage";
import { AddAntigravityAccountModal } from "../antigravity/AddAntigravityAccountModal";
import { AddAccountModal } from "../codex/AddAccountModal";
import { CodexPoolModal } from "../codex/CodexPoolModal";
import { PassphraseModal } from "../common/PassphraseModal";
import { CustomDialog } from "../common/CustomDialog";
import { ANTIGRAVITY_ACTIVE_ID_KEY } from "../../utils/common/app-constants";
import { classifyCodexTier, isCodexAccountOAuth } from "../../utils";
import type { ToastKind } from "../common/Toast";
import { resumeAccountPolling } from "../../utils/account/account-poll-suspension";

export interface AppModalsProps {
  addAgOpen: boolean;
  setAddAgOpen: (open: boolean) => void;
  isCodexModalOpen: boolean;
  setIsCodexModalOpen: (open: boolean) => void;
  poolModalOpen: boolean;
  setPoolModalOpen: (open: boolean) => void;
  editingPool: CodexAccountPool | null;
  antigravityAccounts: AntigravityAccount[];
  setAntigravityAccounts: (accs: AntigravityAccount[]) => void;
  setActiveAntigravityId: (id: string | null) => void;
  codexAccounts: CodexAccount[];
  setCodexAccounts: (accs: CodexAccount[]) => void;
  codexModelCache: Record<string, CodexModelCatalogCacheEntry>;
  fetchCodexModelCatalog: (account: CodexAccount, force?: boolean) => Promise<any>;
  refreshAntigravityAccountsCloudFirst: (
    accs: AntigravityAccount[],
    force?: boolean,
  ) => Promise<void>;
  handleLocalSessionCaptured: (session: any) => void;
  backups: {
    passOpen: boolean;
    setPassOpen: (open: boolean) => void;
    passMode: "export" | "import";
    passError: string;
    clearPassError: () => void;
    exportSuccessPath: string | null;
    handlePassphraseSubmit: (passphrase: string) => Promise<void>;
    handleExportBackup: () => Promise<void>;
    handleCloseExportSuccess: (confirmed: boolean, target: string | null) => Promise<void>;
  };
  bootstrap: {
    updatePromptOpen: boolean;
    setUpdatePromptOpen: (open: boolean) => void;
    updateTag: string;
    handleDownloadUpdate: () => Promise<void>;
  };
  accountOps: {
    accountPendingDelete: {
      name: string;
      email?: string | null;
      onConfirm: () => Promise<void> | void;
    } | null;
    setAccountPendingDelete: (val: any) => void;
    accountPendingApply: {
      title: string;
      message: string;
      onConfirm: () => Promise<void> | void;
    } | null;
    setAccountPendingApply: (val: any) => void;
    handleSaveCodexPool: (pool: CodexAccountPool) => void;
  };
  usageAndOverlay: {
    fetchAccountUsage: (account: CodexAccount, force?: boolean) => Promise<any>;
    setCodexUsageCache: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  };
  showToast: (message: string, kind?: ToastKind) => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  addAgOpen,
  setAddAgOpen,
  isCodexModalOpen,
  setIsCodexModalOpen,
  poolModalOpen,
  setPoolModalOpen,
  editingPool,
  setAntigravityAccounts,
  setActiveAntigravityId,
  codexAccounts,
  setCodexAccounts,
  codexModelCache,
  fetchCodexModelCatalog,
  refreshAntigravityAccountsCloudFirst,
  handleLocalSessionCaptured,
  backups,
  bootstrap,
  accountOps,
  usageAndOverlay,
  showToast,
}) => {
  const { accountPendingDelete, accountPendingApply } = accountOps;
  const { passOpen, passMode, passError, clearPassError, handlePassphraseSubmit, setPassOpen } =
    backups;

  return (
    <>
      <AddAntigravityAccountModal
        isOpen={addAgOpen}
        onClose={() => setAddAgOpen(false)}
        onAccountAdded={async (id) => {
          resumeAccountPolling("antigravity", id);
          const target = loadAntigravityAccounts().find((a) => a.id === id);
          if (target) await refreshAntigravityAccountsCloudFirst([target], true);
        }}
        loadAccounts={loadAntigravityAccounts}
        saveAccounts={(accs) => {
          saveAntigravityAccounts(accs);
          setAntigravityAccounts(accs);
        }}
        setActiveAccountId={(id) => {
          setActiveAntigravityId(id);
          localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, id);
        }}
        onLocalSessionCaptured={handleLocalSessionCaptured}
        showToast={showToast}
      />
      {passOpen && (
        <PassphraseModal
          mode={passMode}
          onSubmit={handlePassphraseSubmit}
          onCancel={() => setPassOpen(false)}
          error={passError}
          onErrorClear={clearPassError}
        />
      )}
      {bootstrap.updatePromptOpen && (
        <CustomDialog
          title="Backup Recommended Before Upgrading"
          message={`A new version (${bootstrap.updateTag || "latest"}) is available. We strongly recommend backing up your data before installing the new upgrade to avoid losing accounts or settings.`}
          isConfirm
          cancelText="I'll backup now"
          confirmText="Download new version"
          confirmVariant="primary"
          onCancelClick={() => {
            bootstrap.setUpdatePromptOpen(false);
            const handleExportBackup = backups.handleExportBackup;
            void handleExportBackup();
          }}
          onClose={(confirmed) => {
            if (confirmed) void bootstrap.handleDownloadUpdate();
            else bootstrap.setUpdatePromptOpen(false);
          }}
        />
      )}
      {backups.exportSuccessPath && (
        <CustomDialog
          title="Backup Exported Successfully"
          message={
            <span>
              Backup exported successfully to:
              <br />
              <code
                style={{
                  wordBreak: "break-all",
                  display: "inline-block",
                  marginTop: "6px",
                  fontSize: "11px",
                  opacity: 0.9,
                }}
              >
                {backups.exportSuccessPath}
              </code>
            </span>
          }
          isConfirm
          confirmText="Open in Explorer"
          cancelText="Close"
          confirmVariant="primary"
          onClose={(confirmed) =>
            backups.handleCloseExportSuccess(confirmed, backups.exportSuccessPath)
          }
        />
      )}
      {poolModalOpen && (
        <CodexPoolModal
          isOpen={poolModalOpen}
          initialPool={editingPool}
          accounts={codexAccounts}
          modelCache={codexModelCache}
          onRequestModelScan={(acc) => fetchCodexModelCatalog(acc)}
          onSave={(pool) => {
            accountOps.handleSaveCodexPool(pool);
            setPoolModalOpen(false);
          }}
          onClose={() => setPoolModalOpen(false)}
        />
      )}
      {isCodexModalOpen && (
        <AddAccountModal
          isOpen={isCodexModalOpen}
          onClose={() => setIsCodexModalOpen(false)}
          onAccountAdded={async (id) => {
            const target = loadCodexAccounts().find((a) => a.id === id);
            if (target) {
              const u = await usageAndOverlay.fetchAccountUsage(target, true);
              if (
                classifyCodexTier(
                  u?.planName ?? target.lastPlan,
                  isCodexAccountOAuth(target, u),
                ) === "FREE"
              ) {
                await fetchCodexModelCatalog(target, true);
              }
            }
          }}
          onAccountsAdded={async (ids) => {
            for (const id of ids) {
              const target = loadCodexAccounts().find((a) => a.id === id);
              if (!target) continue;
              const usage = await usageAndOverlay.fetchAccountUsage(target, true);
              if (
                classifyCodexTier(
                  usage?.planName ?? target.lastPlan,
                  isCodexAccountOAuth(target, usage),
                ) === "FREE"
              ) {
                await fetchCodexModelCatalog(target, true);
              }
            }
          }}
          showAlert={async (m) => showToast(m, "info")}
          loadAccounts={loadCodexAccounts}
          saveAccounts={(accs) => {
            saveCodexAccounts(accs);
            setCodexAccounts(accs);
          }}
          showToast={showToast}
          onStartFetching={(id, isOAuth) => {
            resumeAccountPolling("codex", id);
            usageAndOverlay.setCodexUsageCache((p) => ({ ...p, [id]: { loading: true, isOAuth } }));
          }}
        />
      )}
      {accountPendingDelete && (
        <CustomDialog
          title="Remove Account"
          message={`Are you sure you want to remove ${accountPendingDelete.email && accountPendingDelete.name && accountPendingDelete.name !== accountPendingDelete.email ? `"${accountPendingDelete.name}" (${accountPendingDelete.email})` : accountPendingDelete.name ? `"${accountPendingDelete.name}"` : accountPendingDelete.email ? `"${accountPendingDelete.email}"` : "this account"} from QuotaShift?`}
          isConfirm
          confirmText="Delete"
          confirmVariant="danger"
          onClose={(confirmed) => {
            if (confirmed && accountPendingDelete) {
              const run = accountPendingDelete.onConfirm;
              accountOps.setAccountPendingDelete(null);
              void run();
            } else accountOps.setAccountPendingDelete(null);
          }}
        />
      )}
      {accountPendingApply && (
        <CustomDialog
          title={accountPendingApply.title}
          message={accountPendingApply.message}
          isConfirm
          confirmText="Apply"
          confirmVariant="primary"
          onClose={(confirmed) => {
            if (confirmed && accountPendingApply) {
              const run = accountPendingApply.onConfirm;
              accountOps.setAccountPendingApply(null);
              void run();
            } else accountOps.setAccountPendingApply(null);
          }}
        />
      )}
    </>
  );
};
