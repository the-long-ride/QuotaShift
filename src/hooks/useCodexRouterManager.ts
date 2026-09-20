import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
  CodexRouterStatus,
} from "../utils/common/types";
import { deobfuscate, obfuscate } from "../utils/auth/auth";
import { buildCodexRouterConfig, refreshActivePoolOAuthCredentials } from "../utils";
import { saveCodexAccounts } from "../utils/common/app-storage";
import type { ToastKind } from "../components/common/Toast";
import { CODEX_POOL_ROUTING_KEY } from "../utils/common/app-constants";

export interface UseCodexRouterManagerParams {
  codexAccounts: CodexAccount[];
  setCodexAccounts: (accounts: CodexAccount[]) => void;
  codexPools: CodexAccountPool[];
  codexUsageCache: Record<string, any>;
  codexModelCache: Record<string, CodexModelCatalogCacheEntry>;
  activeCodexId: string | null;
  activeCodexPoolId: string | null;
  recordRoutedCodexUse: (accountId: string) => void;
  showToast: (message: string, kind?: ToastKind) => void;
}

export function useCodexRouterManager({
  codexAccounts,
  setCodexAccounts,
  codexPools,
  codexUsageCache,
  codexModelCache,
  activeCodexId,
  activeCodexPoolId,
  recordRoutedCodexUse,
  showToast,
}: UseCodexRouterManagerParams) {
  const [poolRoutingEnabled, setPoolRoutingEnabled] = useState(false);
  const [poolRoutingBusy, setPoolRoutingBusy] = useState(false);
  const [routerStatus, setRouterStatus] = useState<CodexRouterStatus | null>(null);

  const recordRoutedCodexUseRef = useRef(recordRoutedCodexUse);
  recordRoutedCodexUseRef.current = recordRoutedCodexUse;

  const lastSeenRouterRequestCountRef = useRef(0);
  const routerConfigureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oauthRefreshAttemptAtRef = useRef<Record<string, number>>({});
  const hasConfiguredRouterRef = useRef(false);

  const prepareRouterAccounts = async (accounts: CodexAccount[]) => {
    const result = await refreshActivePoolOAuthCredentials({
      accounts,
      pools: codexPools,
      activePoolId: activeCodexPoolId,
      decodeCredential: deobfuscate,
      encodeCredential: obfuscate,
      refreshToken: (refreshToken) => invoke<any>("refresh_chatgpt_token", { refreshToken }),
      shouldAttempt: (accountId, now) =>
        now - (oauthRefreshAttemptAtRef.current[accountId] ?? 0) >= 60_000,
      onAttempt: (accountId, now) => {
        oauthRefreshAttemptAtRef.current[accountId] = now;
      },
    });
    if (result.refreshedAccountIds.length > 0) {
      saveCodexAccounts(result.accounts);
      setCodexAccounts(result.accounts);
    }
    return result.accounts;
  };

  const handleToggleCodexPoolRouting = async () => {
    const next = !poolRoutingEnabled;
    setPoolRoutingBusy(true);
    try {
      if (next) {
        if (!activeCodexPoolId) {
          showToast("Select a pool before enabling Pool Routing", "warning");
          return;
        }
        await invoke("start_codex_router");
        const routerAccounts = await prepareRouterAccounts(codexAccounts);
        const cfg = buildCodexRouterConfig({
          accounts: routerAccounts,
          pools: codexPools,
          usageCache: codexUsageCache,
          modelCache: codexModelCache,
          appliedAccountId: activeCodexId,
          activePoolId: activeCodexPoolId,
          decodeCredential: deobfuscate,
        });
        await invoke("configure_codex_router", { config: cfg });
        hasConfiguredRouterRef.current = true;
        localStorage.setItem(CODEX_POOL_ROUTING_KEY, "true");
      } else {
        await invoke("stop_codex_router");
        hasConfiguredRouterRef.current = false;
        localStorage.setItem(CODEX_POOL_ROUTING_KEY, "false");
      }
      setPoolRoutingEnabled(next);
      setRouterStatus(await invoke<CodexRouterStatus>("get_codex_router_status"));
    } catch {
      showToast("Failed to start Codex pool routing", "error");
    } finally {
      setPoolRoutingBusy(false);
    }
  };

  useEffect(() => {
    if (!poolRoutingEnabled) {
      if (routerConfigureTimerRef.current) clearTimeout(routerConfigureTimerRef.current);
      routerConfigureTimerRef.current = null;
      return;
    }
    if (!activeCodexPoolId) {
      setPoolRoutingEnabled(false);
      localStorage.setItem(CODEX_POOL_ROUTING_KEY, "false");
      hasConfiguredRouterRef.current = false;
      void invoke<CodexRouterStatus>("stop_codex_router").then(setRouterStatus).catch(console.warn);
      showToast("Pool Routing stopped because no pool is selected", "warning");
      return;
    }
    if (routerConfigureTimerRef.current) clearTimeout(routerConfigureTimerRef.current);
    routerConfigureTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          await invoke("start_codex_router");
          const routerAccounts = await prepareRouterAccounts(codexAccounts);
          const config = buildCodexRouterConfig({
            accounts: routerAccounts,
            pools: codexPools,
            usageCache: codexUsageCache,
            modelCache: codexModelCache,
            appliedAccountId: activeCodexId,
            activePoolId: activeCodexPoolId,
            decodeCredential: deobfuscate,
          });
          const status = await invoke<CodexRouterStatus>("configure_codex_router", { config });
          hasConfiguredRouterRef.current = true;
          setRouterStatus(status);
          localStorage.setItem(CODEX_POOL_ROUTING_KEY, "true");
        } catch (error) {
          console.warn("Failed to refresh Codex router snapshot", error);
          if (!hasConfiguredRouterRef.current) {
            setPoolRoutingEnabled(false);
            localStorage.setItem(CODEX_POOL_ROUTING_KEY, "false");
            void invoke("stop_codex_router").catch(() => {});
            showToast("Failed to restore Codex Pool Routing", "error");
          }
        }
      })();
    }, 150);
    return () => {
      if (routerConfigureTimerRef.current) clearTimeout(routerConfigureTimerRef.current);
    };
  }, [
    poolRoutingEnabled,
    codexAccounts,
    codexPools,
    codexUsageCache,
    codexModelCache,
    activeCodexId,
    activeCodexPoolId,
    setCodexAccounts,
    showToast,
  ]);

  useEffect(() => {
    if (!poolRoutingEnabled) return;
    let cancelled = false;
    const pollRouterStatus = async () => {
      try {
        const status = await invoke<CodexRouterStatus>("get_codex_router_status");
        if (cancelled) return;
        setRouterStatus(status);
        if (status && (status as any).routedRequestCount > lastSeenRouterRequestCountRef.current) {
          if ((status as any).lastRoutedAccountId)
            recordRoutedCodexUseRef.current((status as any).lastRoutedAccountId);
          lastSeenRouterRequestCountRef.current = (status as any).routedRequestCount;
        }
      } catch (error) {
        if (!cancelled) console.warn("Failed to poll Codex router status", error);
      }
    };
    void pollRouterStatus();
    const timer = setInterval(pollRouterStatus, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [poolRoutingEnabled]);

  return {
    poolRoutingEnabled,
    setPoolRoutingEnabled,
    poolRoutingBusy,
    setPoolRoutingBusy,
    routerStatus,
    setRouterStatus,
    handleToggleCodexPoolRouting,
  };
}
