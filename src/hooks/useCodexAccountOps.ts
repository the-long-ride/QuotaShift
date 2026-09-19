import { invoke } from "@tauri-apps/api/core";
import type {
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
} from "../utils/common/types";
import { deobfuscate } from "../utils/auth/auth";
import {
  pickBestCodexPoolMember,
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
import type { ToastKind } from "../components/common/Toast";

export const CODEX_ACTIVE_ID_KEY = "antigravity-codex-active-id";
export const CODEX_ACTIVE_POOL_ID_KEY = "quotashift_codex_active_pool_id_v1";
export const CODEX_ORDER_KEY = "antigravity-codex-account-order";
export const OVERLAY_TRACKED_PROVIDER_KEY = "quotashift_overlay_tracked_provider";
export const OVERLAY_TRACKED_ACCOUNT_ID_KEY = "quotashift_overlay_tracked_account_id";

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
  poolRoutingEnabledRef: React.MutableRefObject<boolean>;
  codexUsageCache: Record<string, any>;
  codexUsageCacheRef: React.MutableRefObject<Record<string, any>>;
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
  activeCodexPoolId: _activeCodexPoolId,
  setActiveCodexPoolId,
  codexModelCacheRef,
  setCodexModelCache,
  fetchCodexModelCatalog,
  poolRoutingEnabledRef,
  codexUsageCache,
  codexUsageCacheRef,
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

  const handleApplyCodexAccount = async (
    acc: CodexAccount,
    modelOverride?: string,
    poolId?: string,
    skipConfirm = false,
  ) => {
    const model = modelOverride?.trim() || null;
    const rawKey = deobfuscate(acc.apiKey);
    const doApply = async () => {
      try {
        await invoke("kill_codex_processes");
        if (poolRoutingEnabledRef.current)
          await invoke("write_codex_auth", {
            content: JSON.stringify(
              { auth_mode: "openai_api_key", OPENAI_API_KEY: rawKey },
              null,
              2,
            ),
          });
        else await invoke("write_codex_auth", { content: buildCodexAuthContent(rawKey) });
        await invoke("sync_codex_provider_config", { account: acc, model }).catch(() => {});
        await invoke("sync_codex_config", { account: acc, model }).catch(() => {});
        setActiveCodexId(acc.id);
        setActiveCodexPoolId(poolId ?? null);
        localStorage.setItem(CODEX_ACTIVE_ID_KEY, acc.id);
        if (poolId) localStorage.setItem(CODEX_ACTIVE_POOL_ID_KEY, poolId);
        const usedAt = Date.now();
        persistCodexLastUsed(acc.id, usedAt);
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
    const next = [
      ...codexPools.filter((p) => p.id !== pool.id),
      { ...pool, activatedAt: Date.now() },
    ];
    setCodexPools(next);
    saveCodexPools(next);
  };

  const handleDeleteCodexPool = (pool: CodexAccountPool) => {
    const next = codexPools.filter((p) => p.id !== pool.id);
    setCodexPools(next);
    saveCodexPools(next);
  };

  const handleApplyBestCodexPool = async (pool: CodexAccountPool) => {
    const best = pickBestCodexPoolMember(pool, codexAccounts, codexUsageCacheRef.current);
    if (best) await handleApplyCodexAccount(best.account, pool.model, pool.id);
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
      localStorage.setItem(CODEX_ACTIVE_ID_KEY, account.id);
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
    handleApplyBestCodexPool,
    handleSwitchBestCodex,
    handleTrackCurrentCodexAccount,
    persistCodexLastUsed,
  };
}
