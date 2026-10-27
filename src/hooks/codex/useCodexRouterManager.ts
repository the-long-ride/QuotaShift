import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
  CodexRouterStatus,
  CodexRouterConfig,
} from "../../utils/common/types";
import type { CodexModelPoolV2 } from "../../utils/codex/codex-pools-v2-types";
import type { SiwcAccountView, SiwcModelView } from "../../utils/codex/siwc-types";
import { deobfuscate } from "../../utils/auth/auth";
import { buildCodexRouterConfig } from "../../utils/codex/codex-router";
import type { ToastKind } from "../../components/common/Toast";
import { CODEX_POOL_ROUTING_KEY, loadRouterPort } from "../../utils/common/app-constants";

const EMPTY_MODEL_POOLS_V2: CodexModelPoolV2[] = [];

export interface UseCodexRouterManagerParams {
  codexAccounts: CodexAccount[];
  setCodexAccounts: (accounts: CodexAccount[]) => void;
  codexPools: CodexAccountPool[];
  modelPoolsV2?: CodexModelPoolV2[];
  codexUsageCache: Record<string, any>;
  codexModelCache: Record<string, CodexModelCatalogCacheEntry>;
  activeCodexId: string | null;
  activeCodexPoolId: string | null;
  recordRoutedCodexUse: (accountId: string) => void;
  showToast: (message: string, kind?: ToastKind) => void;
}

export function useCodexRouterManager({
  codexAccounts,
  modelPoolsV2 = EMPTY_MODEL_POOLS_V2,
  codexUsageCache,
  codexModelCache,
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
  const hasConfiguredRouterRef = useRef(false);

  const enabledPools = modelPoolsV2.filter((pool) => pool.enabled);

  const buildCurrentConfig = async (): Promise<CodexRouterConfig> => {
    const enabledModelPools = modelPoolsV2.filter((pool) => pool.enabled);
    const members = new Set(enabledModelPools.flatMap((pool) => pool.memberAccountIds));
    const config = buildCodexRouterConfig({
      accounts: codexAccounts.filter((account) => members.has(account.id)),
      pools: [],
      usageCache: codexUsageCache,
      modelCache: codexModelCache,
      appliedAccountId: null,
      activePoolId: null,
      decodeCredential: deobfuscate,
    });
    const nativeMembers = new Set(
      enabledModelPools
        .filter((pool) => pool.authMode === "siwc")
        .flatMap((pool) => pool.memberAccountIds),
    );
    const siwcAccounts = nativeMembers.size
      ? await invoke<SiwcAccountView[]>("list_siwc_accounts")
      : [];
    const siwcConfigs = await Promise.all(
      siwcAccounts
        .filter((account) => nativeMembers.has(account.id))
        .map(async (account) => {
          if (!account.isRoutable) {
            throw new Error(`SIWC account ${account.email} has no ChatGPT plan permission`);
          }
          if ((config.accounts ?? []).some((existing) => existing.id === account.id)) {
            throw new Error("SIWC account identifier collides with a Codex account");
          }
          const catalog = await invoke<SiwcModelView[]>("get_siwc_models", {
            registrationId: account.id,
          });
          return {
            id: account.id,
            auth: { kind: "siwc" as const, registrationId: account.id },
            availableModelIds: catalog.map((item) => item.slug),
            quotaWindows: [],
            usageFetchedAt: null,
            modelCatalogFetchedAt: Date.now(),
          };
        }),
    );
    if (siwcConfigs.length !== nativeMembers.size) {
      throw new Error("Some SIWC pool members have not authorized QuotaShift");
    }
    // V2 is authoritative. No legacy OAuth is ever transformed into native SIWC.
    return {
      ...config,
      accounts: [...(config.accounts ?? []), ...siwcConfigs],
      poolsV2: modelPoolsV2,
    };
  };

  const handleToggleCodexPoolRouting = async () => {
    const next = !poolRoutingEnabled;
    setPoolRoutingBusy(true);
    try {
      if (next) {
        if (enabledPools.length === 0) {
          showToast("Enable at least one Model Pool before starting routing", "warning");
          return;
        }
        const config = await buildCurrentConfig();
        await invoke("start_codex_router", { port: loadRouterPort() });
        await invoke("configure_codex_router", { config });
        hasConfiguredRouterRef.current = true;
      } else {
        await invoke("stop_codex_router");
        hasConfiguredRouterRef.current = false;
      }
      setPoolRoutingEnabled(next);
      localStorage.setItem(CODEX_POOL_ROUTING_KEY, String(next));
      setRouterStatus(await invoke<CodexRouterStatus>("get_codex_router_status"));
    } catch (error) {
      if (next) {
        await invoke("stop_codex_router").catch(() => {});
        hasConfiguredRouterRef.current = false;
      }
      showToast(`Model Pool Routing could not be configured: ${String(error)}`, "error");
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
    if (enabledPools.length === 0) {
      setPoolRoutingEnabled(false);
      localStorage.setItem(CODEX_POOL_ROUTING_KEY, "false");
      hasConfiguredRouterRef.current = false;
      void invoke<CodexRouterStatus>("stop_codex_router").then(setRouterStatus).catch(console.warn);
      showToast("Model Pool Routing stopped because every pool is disabled", "warning");
      return;
    }
    if (routerConfigureTimerRef.current) clearTimeout(routerConfigureTimerRef.current);
    routerConfigureTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const config = await buildCurrentConfig();
          await invoke("start_codex_router", { port: loadRouterPort() });
          const status = await invoke<CodexRouterStatus>("configure_codex_router", { config });
          hasConfiguredRouterRef.current = true;
          setRouterStatus(status);
          localStorage.setItem(CODEX_POOL_ROUTING_KEY, "true");
        } catch (error) {
          console.warn("Failed to refresh multi-pool router snapshot", error);
          if (!hasConfiguredRouterRef.current) {
            setPoolRoutingEnabled(false);
            localStorage.setItem(CODEX_POOL_ROUTING_KEY, "false");
            void invoke("stop_codex_router").catch(() => {});
          }
          showToast(`Model Pool Routing configuration rejected: ${String(error)}`, "error");
        }
      })();
    }, 150);
    return () => {
      if (routerConfigureTimerRef.current) clearTimeout(routerConfigureTimerRef.current);
    };
  }, [
    poolRoutingEnabled,
    codexAccounts,
    modelPoolsV2,
    codexUsageCache,
    codexModelCache,
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
        if (status && status.routedRequestCount > lastSeenRouterRequestCountRef.current) {
          if (status.lastRoutedAccountId) {
            recordRoutedCodexUseRef.current(status.lastRoutedAccountId);
          }
          lastSeenRouterRequestCountRef.current = status.routedRequestCount;
        }
      } catch (error) {
        if (!cancelled) console.warn("Failed to poll Model Pool Routing status", error);
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
