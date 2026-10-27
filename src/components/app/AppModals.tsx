import React from "react";
import {
  loadAntigravityAccounts,
  saveAntigravityAccounts,
  loadCodexAccounts,
  saveCodexAccounts,
} from "../../utils/common/backup/app-storage";
import { AddAntigravityAccountModal } from "../antigravity/modal/AddAntigravityAccountModal";
import { AddAccountModal } from "../codex/modals/AddAccountModal";
import { CodexPoolModal } from "../codex/pools/CodexPoolModal";
import { PassphraseModal } from "../common/dialogs/PassphraseModal";
import { CustomDialog } from "../common/dialogs/CustomDialog";
import { ANTIGRAVITY_ACTIVE_ID_KEY } from "../../utils/common/backup/app-constants";
import { classifyCodexTier, isCodexAccountOAuth } from "../../utils";
import type { ToastKind } from "../common/Toast";
import { resumeAccountPolling } from "../../utils/account/capture/account-poll-suspension";
import { resolveDisplayUpdateTag } from "../../utils/common/update-policy";

import type { useAppCoordinator } from "../../hooks/app/useAppCoordinator";

export interface AppModalsProps {
  coord: ReturnType<typeof useAppCoordinator>;
  showToast: (message: string, kind?: ToastKind) => void;
}

export const AppModals: React.FC<AppModalsProps> = ({ coord, showToast }) => {
  const {
    addAgOpen,
    setAddAgOpen,
    reauthAgAccount,
    setReauthAgAccount,
    isCodexModalOpen,
    setIsCodexModalOpen,
    reauthCodexAccount,
    setReauthCodexAccount,
    poolModalOpen,
    setPoolModalOpen,
    editingPool,
    setAntigravityAccounts,
    setActiveAntigravityId,
    codexAccounts,
    setCodexAccounts,
    refreshAntigravityAccountsCloudFirst,
    localSession,
    codexModelScan,
    backups,
    bootstrap,
    accountOps,
    usageAndOverlay,
  } = coord;
  const { codexModelCache, fetchCodexModelCatalog } = codexModelScan;
  const { handleLocalAntigravitySessionCaptured: handleLocalSessionCaptured } = localSession;
  const { accountPendingDelete, accountPendingApply } = accountOps;
  const { passOpen, passMode, passError, clearPassError, handlePassphraseSubmit, setPassOpen } =
    backups;

  return (
    <>
      <AddAntigravityAccountModal
        isOpen={addAgOpen}
        reauthAccount={reauthAgAccount}
        onClose={() => {
          setAddAgOpen(false);
          setReauthAgAccount?.(null);
        }}
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
          message={`A new version (${resolveDisplayUpdateTag(bootstrap.updateTag)}) is available. We strongly recommend backing up your data before installing the new upgrade to avoid losing accounts or settings.`}
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
          reauthAccount={reauthCodexAccount}
          onClose={() => {
            setIsCodexModalOpen(false);
            setReauthCodexAccount?.(null);
          }}
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
