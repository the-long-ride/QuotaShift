import { invoke } from "@tauri-apps/api/core";
import type { AntigravityAccount } from "../../utils/common/types";
import { deobfuscate } from "../../utils/auth/auth";
import { markAccountLastUsed, pickBestAntigravityAccount } from "../../utils";
import { saveAntigravityAccounts } from "../../utils/common/app-storage";
import { saveAccountOrder } from "../../utils/account/account-order";
import { extractAntigravitySessionAccount } from "../../utils/antigravity/current-local-session";
import {
  findAntigravityAccountMatch,
  upsertAccountById,
} from "../../utils/account/current-account";
import type { ToastKind } from "../../components/common/Toast";
import { buildApplyDialogMessage, loadRestartOnSwitch } from "../../utils/common/restart-on-switch";
import {
  ANTIGRAVITY_ACTIVE_ID_KEY,
  ANTIGRAVITY_ORDER_KEY,
  OVERLAY_TRACKED_ACCOUNT_ID_KEY,
  OVERLAY_TRACKED_PROVIDER_KEY,
} from "../../utils/common/app-constants";
import { loadTrackedList } from "../../utils/common/tracked-accounts";

export interface UseAntigravityAccountOpsParams {
  antigravityAccounts: AntigravityAccount[];
  setAntigravityAccounts: (accs: AntigravityAccount[]) => void;
  activeAntigravityId: string | null;
  setActiveAntigravityId: (id: string | null) => void;
  antigravityUsageCache: Record<string, any>;
  showToast: (message: string, kind?: ToastKind) => void;
  triggerRefresh: (force?: boolean) => Promise<void>;
  handleApplyAccountToLocalSession: (acc: AntigravityAccount) => void;
  syncTrackedIdentityState: (provider: "antigravity" | "codex" | "claude", id: string) => void;
  refreshAntigravityAccountsCloudFirst: (
    accs: AntigravityAccount[],
    force?: boolean,
  ) => Promise<void>;
  setAccountPendingApply: React.Dispatch<
    React.SetStateAction<{
      title: string;
      message: string;
      onConfirm: () => Promise<void> | void;
    } | null>
  >;
  setAccountPendingDelete: React.Dispatch<
    React.SetStateAction<{
      name: string;
      email?: string | null;
      onConfirm: () => Promise<void> | void;
    } | null>
  >;
  setTrackingCurrentProvider: (val: "antigravity" | "codex" | null) => void;
}

export function useAntigravityAccountOps({
  antigravityAccounts,
  setAntigravityAccounts,
  activeAntigravityId,
  setActiveAntigravityId,
  antigravityUsageCache,
  showToast,
  triggerRefresh,
  handleApplyAccountToLocalSession,
  syncTrackedIdentityState,
  refreshAntigravityAccountsCloudFirst,
  setAccountPendingApply,
  setAccountPendingDelete,
  setTrackingCurrentProvider,
}: UseAntigravityAccountOpsParams) {
  const persistAntigravityLastUsed = (id: string, usedAt = Date.now()) => {
    const updated = markAccountLastUsed(antigravityAccounts, id, usedAt);
    if (updated === antigravityAccounts) return;
    saveAntigravityAccounts(updated);
    setAntigravityAccounts(updated);
  };

  const handleApplyAntigravityAccount = async (acc: AntigravityAccount, skipConfirm = false) => {
    const restart = loadRestartOnSwitch();
    const doApply = async () => {
      const switchResult = await invoke<{ success: boolean; message: string }>(
        "switch_antigravity_account",
        {
          token: deobfuscate(acc.token),
          refreshToken: acc.refreshToken ? deobfuscate(acc.refreshToken) : null,
          profileUrl: acc.profileUrl,
          email: acc.email,
          restart,
        },
      );
      showToast(switchResult.message);
      setActiveAntigravityId(acc.id);
      localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, acc.id);
      persistAntigravityLastUsed(acc.id);
      handleApplyAccountToLocalSession(acc);
      void triggerRefresh(true);
    };
    if (skipConfirm) {
      await doApply();
      return;
    }
    setAccountPendingApply({
      title: "Apply Antigravity Account",
      message: buildApplyDialogMessage(
        "antigravity",
        acc.label || acc.email || "this account",
        restart,
      ),
      onConfirm: doApply,
    });
  };

  const handleDeleteAntigravityAccount = async (acc: AntigravityAccount) => {
    setAccountPendingDelete({
      name: acc.label || "Antigravity",
      email: acc.email || null,
      onConfirm: async () => {
        const matched = acc;
        persistAntigravityLastUsed(matched.id);
        const updated = antigravityAccounts.filter((a) => a.id !== acc.id);
        setAntigravityAccounts(updated);
        saveAntigravityAccounts(updated);
        saveAccountOrder(
          ANTIGRAVITY_ORDER_KEY,
          updated.map((a) => a.id),
        );
        if (activeAntigravityId === acc.id) {
          const nextId = updated[0]?.id ?? null;
          setActiveAntigravityId(nextId);
          if (nextId) localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, nextId);
          else localStorage.removeItem(ANTIGRAVITY_ACTIVE_ID_KEY);
        }
      },
    });
  };

  const handleSwitchBestAntigravity = async () => {
    const b = pickBestAntigravityAccount(antigravityAccounts, antigravityUsageCache);
    if (b && b.account.id !== activeAntigravityId) await handleApplyAntigravityAccount(b.account);
  };

  const handleTrackCurrentAntigravityAccount = async () => {
    setTrackingCurrentProvider("antigravity");
    try {
      const session = await invoke("read_antigravity_session");
      const candidate = extractAntigravitySessionAccount(session);
      if (!candidate) {
        showToast("No active Antigravity session found in system", "warning");
        return;
      }
      const match = findAntigravityAccountMatch(antigravityAccounts, candidate),
        account: AntigravityAccount = match || { ...candidate, id: `ag-${Date.now()}` };
      if (!match) {
        const updated = upsertAccountById(antigravityAccounts, account);
        saveAntigravityAccounts(updated);
        setAntigravityAccounts(updated);
        saveAccountOrder(
          ANTIGRAVITY_ORDER_KEY,
          updated.map((a) => a.id),
        );
      }
      setActiveAntigravityId(account.id);
      localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, account.id);
      const hadTracked = loadTrackedList().length > 0;
      syncTrackedIdentityState("antigravity", account.id);
      localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "antigravity");
      localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, account.id);
      await invoke("set_monitored_codex", { info: null });
      await refreshAntigravityAccountsCloudFirst([account], true);
      if (hadTracked) {
        showToast(`Monitoring Antigravity account: ${account.email || account.label}`);
      }
    } catch (e: any) {
      showToast(`Failed to monitor current Antigravity account: ${e?.message || e}`, "error");
    } finally {
      setTrackingCurrentProvider(null);
    }
  };

  return {
    handleApplyAntigravityAccount,
    handleDeleteAntigravityAccount,
    handleSwitchBestAntigravity,
    handleTrackCurrentAntigravityAccount,
    persistAntigravityLastUsed,
  };
}
