import { invoke } from "@tauri-apps/api/core";
import type {
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
} from "../utils/common/types";
import { deobfuscate } from "../utils/auth/auth";
import {
  reconcileCodexPools,
  markAccountLastUsed,
  pickBestCodexAccount,
  classifyCodexTier,
  isCodexAccountOAuth,
} from "../utils";
import {
  saveCodexAccounts,
  saveCodexPools,
  saveCodexModelCache,
} from "../utils/common/app-storage";
import { saveAccountOrder } from "../utils/account/account-order";
import { parseCodexLocalAuth, buildCodexAuthContent } from "../utils/codex/current-local-session";
import { findCodexAccountMatch, upsertAccountById } from "../utils/account/current-account";
import {
  clearCodexActivePool,
  persistCodexActiveAccount,
  persistCodexActivePool,
} from "../utils/codex/codex-active-storage";
import type { ToastKind } from "../components/common/Toast";
import { CODEX_ACTIVE_ID_KEY, CODEX_ORDER_KEY } from "../utils/common/app-constants";

export interface UseCodexAccountOpsParams {
  codexAccounts: CodexAccount[];
  setCodexAccounts: (accs: CodexAccount[]) => void;
  activeCodexId: string | null;
  setActiveCodexId: (id: string | null) => void;
  codexPools: CodexAccountPool[];
  setCodexPools: (pools: CodexAccountPool[]) => void;
  codexPoolsRef: React.MutableRefObject<CodexAccountPool[]>;
  activeCodexPoolId: string | null;
  setActiveCodexPoolId: (id: string | null) => void;
  codexModelCacheRef: React.MutableRefObject<Record<string, CodexModelCatalogCacheEntry>>;
  setCodexModelCache: React.Dispatch<
    React.SetStateAction<Record<string, CodexModelCatalogCacheEntry>>
  >;
  fetchCodexModelCatalog: (account: CodexAccount, force?: boolean) => Promise<any>;
  codexUsageCache: Record<string, any>;
  showToast: (message: string, kind?: ToastKind) => void;
  syncTrackedIdentityState: (provider: "antigravity" | "codex" | "claude", id: string) => void;
  handleTrackCodexAccount: (acc: CodexAccount) => Promise<any>;
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

export function useCodexAccountOps({
  codexAccounts,
  setCodexAccounts,
  activeCodexId,
  setActiveCodexId,
  codexPools,
  setCodexPools,
  codexPoolsRef,
  activeCodexPoolId,
  setActiveCodexPoolId,
  codexModelCacheRef,
  setCodexModelCache,
  fetchCodexModelCatalog,
  codexUsageCache,
  showToast,
  syncTrackedIdentityState: _syncTrackedIdentityState,
  handleTrackCodexAccount,
  setAccountPendingApply,
  setAccountPendingDelete,
  setTrackingCurrentProvider,
}: UseCodexAccountOpsParams) {
  const persistCodexLastUsed = (id: string, usedAt = Date.now()) => {
    const updated = markAccountLastUsed(codexAccounts, id, usedAt);
    if (updated === codexAccounts) return;
    saveCodexAccounts(updated);
    setCodexAccounts(updated);
  };

  const handleApplyCodexAccount = async (acc: CodexAccount, skipConfirm = false) => {
    const rawKey = deobfuscate(acc.apiKey);
    const doApply = async () => {
      try {
        await invoke("kill_codex_processes");
        await invoke("write_codex_auth", { content: buildCodexAuthContent(rawKey) });
        setActiveCodexId(acc.id);
        persistCodexActiveAccount(localStorage, acc.id);
        persistCodexLastUsed(acc.id, Date.now());
        showToast(`Applied Codex account: ${acc.label || acc.email || "ChatGPT"}`);
      } catch (err) {
        showToast(`Failed to apply Codex account: ${String(err)}`, "error");
      }
    };
    if (skipConfirm) {
      await doApply();
      return;
    }
    setAccountPendingApply({
      title: "Apply Codex Account",
      message: `Applying "${acc.label || acc.email || "this account"}" will kill all current Codex processes (Codex CLI, ChatGPT desktop app, and IDE extension) to switch credentials. Do you want to continue?`,
      onConfirm: doApply,
    });
  };

  const handleDeleteCodexAccount = async (acc: CodexAccount) => {
    setAccountPendingDelete({
      name: acc.label || "ChatGPT",
      email: acc.email || null,
      onConfirm: async () => {
        const matchedId = acc.id;
        persistCodexLastUsed(matchedId);
        const list = codexAccounts.filter((a) => a.id !== acc.id);
        setCodexAccounts(list);
        saveCodexAccounts(list);
        saveAccountOrder(
          CODEX_ORDER_KEY,
          list.map((a) => a.id),
        );
        const pools = reconcileCodexPools(codexPoolsRef.current, list);
        setCodexPools(pools);
        saveCodexPools(pools);
        const next = { ...codexModelCacheRef.current };
        delete next[acc.id];
        setCodexModelCache(next);
        saveCodexModelCache(next);
        if (activeCodexId === acc.id) {
          const nextAcc = list[0] ?? null;
          setActiveCodexId(nextAcc?.id ?? null);
          if (nextAcc) {
            localStorage.setItem(CODEX_ACTIVE_ID_KEY, nextAcc.id);
            await handleApplyCodexAccount(nextAcc);
          } else localStorage.removeItem(CODEX_ACTIVE_ID_KEY);
        }
      },
    });
  };

  const handleSaveCodexPool = (pool: CodexAccountPool) => {
    const next = [...codexPools.filter((p) => p.id !== pool.id), pool];
    setCodexPools(next);
    saveCodexPools(next);
  };

  const handleDeleteCodexPool = (pool: CodexAccountPool) => {
    const next = codexPools.filter((p) => p.id !== pool.id);
    setCodexPools(next);
    saveCodexPools(next);
    if (activeCodexPoolId === pool.id) {
      setActiveCodexPoolId(null);
      clearCodexActivePool(localStorage);
    }
  };

  const handleActivateCodexPool = (pool: CodexAccountPool) => {
    setActiveCodexPoolId(pool.id);
    persistCodexActivePool(localStorage, pool.id);
    showToast(`Selected Pool Routing pool: ${pool.name}`);
  };

  const handleSwitchBestCodex = async () => {
    const b = pickBestCodexAccount(codexAccounts, codexUsageCache);
    if (b && b.account.id !== activeCodexId) await handleApplyCodexAccount(b.account);
  };

  const handleTrackCurrentCodexAccount = async () => {
    setTrackingCurrentProvider("codex");
    try {
      const auth = await invoke("read_codex_auth");
      const candidate = parseCodexLocalAuth(auth);
      if (!candidate) {
        showToast("No active Codex session found in system", "warning");
        return;
      }
      const match = findCodexAccountMatch(codexAccounts, candidate),
        account: CodexAccount = match || { ...candidate, id: `codex-${Date.now()}` };
      if (!match) {
        const updated = upsertAccountById(codexAccounts, account);
        saveCodexAccounts(updated);
        setCodexAccounts(updated);
        saveAccountOrder(
          CODEX_ORDER_KEY,
          updated.map((a) => a.id),
        );
      }
      setActiveCodexId(account.id);
      persistCodexActiveAccount(localStorage, account.id);
      const u = await handleTrackCodexAccount(account);
      if (
        !match &&
        classifyCodexTier(u?.planName ?? account.lastPlan, isCodexAccountOAuth(account, u)) ===
          "FREE"
      )
        await fetchCodexModelCatalog(account, true);
      if (!u) showToast("Monitoring Codex session (cloud usage unavailable)", "info");
      showToast(`Monitoring Codex account: ${account.email || account.label}`);
    } catch (e: any) {
      showToast(`Failed to monitor current Codex account: ${e?.message || e}`, "error");
    } finally {
      setTrackingCurrentProvider(null);
    }
  };

  return {
    handleApplyCodexAccount,
    handleDeleteCodexAccount,
    handleSaveCodexPool,
    handleDeleteCodexPool,
    handleActivateCodexPool,
    handleSwitchBestCodex,
    handleTrackCurrentCodexAccount,
    persistCodexLastUsed,
  };
}
