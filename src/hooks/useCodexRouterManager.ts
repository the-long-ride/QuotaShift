import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
  CodexRouterStatus,
} from "../utils/common/types";
import { deobfuscate } from "../utils/auth/auth";
import { buildCodexRouterConfig } from "../utils";
import type { ToastKind } from "../components/common/Toast";

export const CODEX_POOL_ROUTING_KEY = "quotashift_codex_pool_routing_v1";

export interface UseCodexRouterManagerParams {
  codexAccounts: CodexAccount[];
  codexPools: CodexAccountPool[];
  codexUsageCache: Record<string, any>;
  codexModelCache: Record<string, CodexModelCatalogCacheEntry>;
  activeCodexId: string | null;
  recordRoutedCodexUse: (accountId: string) => void;
  showToast: (message: string, kind?: ToastKind) => void;
}

export function useCodexRouterManager({
  codexAccounts,
  codexPools,
  codexUsageCache,
  codexModelCache,
  activeCodexId,
  recordRoutedCodexUse,
  showToast,
}: UseCodexRouterManagerParams) {
  const [poolRoutingEnabled, setPoolRoutingEnabled] = useState(false);
  const [poolRoutingBusy, setPoolRoutingBusy] = useState(false);
  const [routerStatus, setRouterStatus] = useState<CodexRouterStatus | null>(null);

  const poolRoutingEnabledRef = useRef(poolRoutingEnabled);
  poolRoutingEnabledRef.current = poolRoutingEnabled;

  const recordRoutedCodexUseRef = useRef(recordRoutedCodexUse);
  recordRoutedCodexUseRef.current = recordRoutedCodexUse;

  const lastSeenRouterRequestCountRef = useRef(0);
  const routerConfigureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggleCodexPoolRouting = async () => {
    const next = !poolRoutingEnabled;
    setPoolRoutingBusy(true);
    try {
      if (next) {
        await invoke("start_codex_router");
        const cfg = buildCodexRouterConfig({
          accounts: codexAccounts,
          pools: codexPools,
          usageCache: codexUsageCache,
          modelCache: codexModelCache,
          appliedAccountId: activeCodexId,
          decodeCredential: deobfuscate,
        });
        await invoke("configure_codex_router", { config: cfg });
        localStorage.setItem(CODEX_POOL_ROUTING_KEY, "true");
      } else {
        await invoke("stop_codex_router");
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
    if (routerConfigureTimerRef.current) clearTimeout(routerConfigureTimerRef.current);
    routerConfigureTimerRef.current = setTimeout(() => {
      const config = buildCodexRouterConfig({
        accounts: codexAccounts,
        pools: codexPools,
        usageCache: codexUsageCache,
        modelCache: codexModelCache,
        appliedAccountId: activeCodexId,
        decodeCredential: deobfuscate,
      });
      invoke<CodexRouterStatus>("configure_codex_router", { config })
        .then((s) => setRouterStatus(s))
        .catch((e) => console.warn("Failed to refresh Codex router snapshot", e));
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
    poolRoutingEnabledRef,
    handleToggleCodexPoolRouting,
  };
}
