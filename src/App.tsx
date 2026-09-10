import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core"; import { listen, emit } from "@tauri-apps/api/event"; import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import type { OverlayAccountData } from "./components/OverlayApp"; import type { ClaudeMonitorStatus, AntigravityAccount, AntigravityUsageCacheEntry, AntigravityWorkerProgress, CodexAccount, CodexAccountPool, CodexModelCatalogCacheEntry, CodexRouterStatus, FullStatus, CodexMonitoredInfo } from "./utils/types";
import { deobfuscate, obfuscate } from "./utils/auth"; import { isUsageCacheFresh, pickBestCodexPoolMember, findCodexPoolFailover, reconcileCodexPools, normalizeCodexPools, isCodexModelCacheFresh, normalizeCodexModelCatalog, buildCodexRouterConfig, normalizeCodexUsageWindows, markAccountLastUsed, savePersistentWorkerPreference, pickBestAntigravityAccount, pickBestCodexAccount } from "./utils";
import { sanitizePollInterval, loadPollIntervalPreference, savePollIntervalPreference } from "./utils/poll-interval";
import { loadAntigravityAccounts, saveAntigravityAccounts, loadCodexAccounts, saveCodexAccounts, loadCodexPools, saveCodexPools, loadCodexModelCache, saveCodexModelCache } from "./utils/app-storage";
import { refreshAntigravityAccountsCloudFirst as refreshAntigravityCloudOps } from "./utils/app-antigravity-ops"; import { fetchCodexUsageData } from "./utils/app-codex-ops"; import { buildClaudeOverlayPayload, buildAntigravityOverlayPayload } from "./utils/app-overlay-helpers"; import { saveAccountOrder, sortByOrder } from "./utils/account-order"; import { buildBackupData, encryptBackup, decryptBackup } from "./utils/app-backup";
import { isNewerVersion } from "./utils/update-policy";
import { Header } from "./components/Header"; import { AntigravityTab } from "./components/AntigravityTab"; import { CodexTab } from "./components/CodexTab"; import { ClaudeTab } from "./components/ClaudeTab";
import { ClaudeLogo } from "./components/ClaudeLogo";
import { AddAccountModal } from "./components/AddAccountModal"; import { AddAntigravityAccountModal } from "./components/AddAntigravityAccountModal"; import { PassphraseModal } from "./components/PassphraseModal"; import { CodexPoolModal } from "./components/CodexPoolModal"; import { CustomDialog } from "./components/CustomDialog"; import { Toast, ToastKind, ToastMessage } from "./components/Toast"; import { Tooltip } from "./components/Tooltip"; import { useLocalSession } from "./hooks/useLocalSession"; import { useAppThemeAndOverlay } from "./hooks/useAppThemeAndOverlay";

export { loadAntigravityAccounts, loadCodexAccounts };
export { resolveAntigravityPlanName } from "./utils/app-constants";

export const CODEX_POOLS_KEY = "quotashift_codex_account_pools_v1", CODEX_ACTIVE_POOL_ID_KEY = "quotashift_codex_active_pool_id_v1", CODEX_MODEL_CATALOG_STORAGE_KEY = "quotashift_codex_model_catalog_v1", CODEX_POOL_ROUTING_KEY = "quotashift_codex_pool_routing_v1";
export const OVERLAY_TRACKED_PROVIDER_KEY = "quotashift_overlay_tracked_provider", OVERLAY_TRACKED_ACCOUNT_ID_KEY = "quotashift_overlay_tracked_account_id", ANTIGRAVITY_ACTIVE_ID_KEY = "antigravity-active-id", CODEX_ACTIVE_ID_KEY = "antigravity-codex-active-id", OFFICIAL_RELEASE_URL = "https://github.com/the-long-ride/QuotaShift/releases/latest", THEME_KEY = "antigravity-theme", KEEP_ALIVE_KEY = "keepAliveActive", OVERLAY_ENABLED_KEY = "quotashift_overlay_enabled", ANTIGRAVITY_ORDER_KEY = "antigravity-account-order", CODEX_ORDER_KEY = "antigravity-codex-account-order";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"antigravity" | "codex" | "claude">("antigravity");
  const [antigravityAccounts, setAntigravityAccounts] = useState<AntigravityAccount[]>(() => loadAntigravityAccounts());
  const [activeAntigravityId, setActiveAntigravityId] = useState<string | null>(() => { return localStorage.getItem(ANTIGRAVITY_ACTIVE_ID_KEY); });
  const [codexAccounts, setCodexAccounts] = useState<CodexAccount[]>(() => loadCodexAccounts());
  const [activeCodexId, setActiveCodexId] = useState<string | null>(() => { return localStorage.getItem(CODEX_ACTIVE_ID_KEY); });
  const [codexPools, setCodexPools] = useState<CodexAccountPool[]>(() => loadCodexPools()), [activeCodexPoolId, setActiveCodexPoolId] = useState<string | null>(() => localStorage.getItem(CODEX_ACTIVE_POOL_ID_KEY));
  const [codexModelCache, setCodexModelCache] = useState<Record<string, CodexModelCatalogCacheEntry>>(() => loadCodexModelCache());
  const [codexModelScanProgress, setCodexModelScanProgress] = useState({ running: false, total: 0, completed: 0, succeeded: 0, failed: 0 });
  const [poolRoutingEnabled, setPoolRoutingEnabled] = useState(false), [poolRoutingBusy, setPoolRoutingBusy] = useState(false), [routerStatus, setRouterStatus] = useState<CodexRouterStatus | null>(null);
  const [trackedProvider, setTrackedProvider] = useState<"antigravity" | "codex" | "claude">(() => (localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY) as any) || "antigravity");
  const [trackedAccountId, setTrackedAccountId] = useState<string | null>(() => localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY));
  const [claudeMonitorStatus, setClaudeMonitorStatus] = useState<ClaudeMonitorStatus>({ installed: false, settingsPath: null, source: "none", session: null, localUsage: null, error: null });
  const [persistentWorkers, setPersistentWorkers] = useState(false);
  const [pollInterval, setPollInterval] = useState(() => loadPollIntervalPreference());
  const [toast, setToast] = useState<ToastMessage | null>(null), [addAgOpen, setAddAgOpen] = useState(false), [isCodexModalOpen, setIsCodexModalOpen] = useState(false), [passOpen, setPassOpen] = useState(false), [passMode, setPassMode] = useState<"export" | "import">("export"), [pendingBackup, setPendingBackup] = useState<string | null>(null), [poolModalOpen, setPoolModalOpen] = useState(false), [editingPool, setEditingPool] = useState<CodexAccountPool | null>(null), [antigravityUsageCache, setAntigravityUsageCache] = useState<Record<string, AntigravityUsageCacheEntry>>({}), [codexUsageCache, setCodexUsageCache] = useState<Record<string, any>>({}), [updateAvailable, setUpdateAvailable] = useState(false), [updateTag, setUpdateTag] = useState(""), [isRefreshing, setIsRefreshing] = useState(false), [lastFullStatus, setLastFullStatus] = useState<any>(null), [accountPendingDelete, setAccountPendingDelete] = useState<{ name: string; email?: string | null; onConfirm: () => Promise<void> | void } | null>(null);

  const { isDarkMode, handleToggleTheme, keepAliveActive, handleToggleKeepAlive, overlayEnabled, handleToggleOverlay, isOnline, statusText } = useAppThemeAndOverlay();
  const codexPoolsRef = useRef(codexPools); codexPoolsRef.current = codexPools; const codexModelCacheRef = useRef(codexModelCache); codexModelCacheRef.current = codexModelCache; const poolRoutingEnabledRef = useRef(poolRoutingEnabled); poolRoutingEnabledRef.current = poolRoutingEnabled; const codexFailoverLatchRef = useRef<Record<string, number>>({});
  const activeCodexPoolIdRef = useRef(activeCodexPoolId); activeCodexPoolIdRef.current = activeCodexPoolId; const codexUsageCacheRef = useRef(codexUsageCache); codexUsageCacheRef.current = codexUsageCache; const antigravityUsageCacheRef = useRef(antigravityUsageCache); antigravityUsageCacheRef.current = antigravityUsageCache; const lastSeenRouterRequestCountRef = useRef(0);
  const routerConfigureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); const pollIntervalRef = useRef(pollInterval); pollIntervalRef.current = pollInterval; const lastRefreshTimeRef = useRef(0);

  const showToast = (message: string, kind: ToastKind = "info") => setToast({ id: Date.now(), message, kind, durationMs: 3000 });
  const persistCodexLastUsed = (id: string, usedAt = Date.now()) => { markAccountLastUsed(codexAccounts, id, usedAt); };
  void ((acc: CodexAccount, usedAt: number) => persistCodexLastUsed(acc.id, usedAt));
  const persistAntigravityLastUsed = (id: string, usedAt = Date.now()) => { markAccountLastUsed(antigravityAccounts, id, usedAt); };
  const recordRoutedCodexUse = (accountId: string) => persistCodexLastUsed(accountId);

  const refreshAntigravityAccountsCloudFirst = async (accs: AntigravityAccount[] = [], force = true) => {
    // fetchAntigravityAccountQuota exact_grouped refreshExactAntigravityAccounts
    return refreshAntigravityCloudOps(accs, force, persistentWorkers, antigravityUsageCacheRef, setAntigravityUsageCache, setAntigravityAccounts);
  };

  const { localAntigravitySession, updateLocalSessionFromStatus, handleLocalAntigravitySessionCaptured, handleAddLocalSessionToMonitored } = useLocalSession(
    antigravityAccounts, setAntigravityAccounts, refreshAntigravityAccountsCloudFirst
  );

  const handleTogglePersistentWorkers = async () => {
    const next = !persistentWorkers; setPersistentWorkers(next); savePersistentWorkerPreference(next);
  };
  // Poll Interval Changed
  const handlePollIntervalChange = async (val: number) => {
    const sanitized = sanitizePollInterval(val); savePollIntervalPreference(sanitized); setPollInterval(sanitized);
    await invoke("set_poll_interval", { seconds: BigInt(sanitized) });
  };

  const handleApplyAntigravityAccount = async (acc: AntigravityAccount) => {
    const switchResult = await invoke<{ success: boolean; message: string }>("switch_antigravity_account", { token: deobfuscate(acc.token), refreshToken: acc.refreshToken ? deobfuscate(acc.refreshToken) : null, profileUrl: acc.profileUrl, email: acc.email });
    showToast(switchResult.message); setActiveAntigravityId(acc.id); localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, acc.id); persistAntigravityLastUsed(acc.id);
  };
  const handleDeleteAntigravityAccount = async (acc: AntigravityAccount) => {
    const name = acc.label || "Antigravity";
    setAccountPendingDelete({
      name,
      email: acc.email || null,
      onConfirm: async () => {
        const matched = acc; persistAntigravityLastUsed(matched.id); const updated = antigravityAccounts.filter((a) => a.id !== acc.id); setAntigravityAccounts(updated); saveAntigravityAccounts(updated); saveAccountOrder(ANTIGRAVITY_ORDER_KEY, updated.map((a) => a.id));
        if (activeAntigravityId === acc.id) { const nextId = updated.length > 0 ? updated[0].id : null; setActiveAntigravityId(nextId); if (nextId) localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, nextId); else localStorage.removeItem(ANTIGRAVITY_ACTIVE_ID_KEY); }
      },
    });
  };

  const handleToggleCodexPoolRouting = async () => {
    const next = !poolRoutingEnabled; setPoolRoutingBusy(true);
    try {
      if (next) {
        await invoke("start_codex_router");
        const cfg = buildCodexRouterConfig({ accounts: codexAccounts, pools: codexPools, usageCache: codexUsageCache, modelCache: codexModelCache, appliedAccountId: activeCodexId, decodeCredential: deobfuscate }); // 150
        await invoke("configure_codex_router", { config: cfg }); localStorage.setItem(CODEX_POOL_ROUTING_KEY, "true");
      } else { await invoke("stop_codex_router"); localStorage.setItem(CODEX_POOL_ROUTING_KEY, "false"); }
      setPoolRoutingEnabled(next); setRouterStatus(await invoke<CodexRouterStatus>("get_codex_router_status"));
    } catch { showToast("Failed to start Codex pool routing", "error"); } finally { setPoolRoutingBusy(false); }
  };

  const handleApplyCodexAccount = async (acc: CodexAccount, modelOverride?: string, poolId?: string) => {
    const model = modelOverride?.trim() || null, rawKey = deobfuscate(acc.apiKey);
    if (poolRoutingEnabledRef.current) await invoke("write_codex_auth", { content: JSON.stringify({ auth_mode: "openai_api_key", OPENAI_API_KEY: rawKey }, null, 2) });
    await invoke("sync_codex_provider_config", { account: acc, model }); await invoke("sync_codex_config", { account: acc, model });
    setActiveCodexId(acc.id); setActiveCodexPoolId(poolId ?? null); localStorage.setItem(CODEX_ACTIVE_ID_KEY, acc.id);
    if (poolId) localStorage.setItem(CODEX_ACTIVE_POOL_ID_KEY, poolId); else localStorage.removeItem(CODEX_ACTIVE_POOL_ID_KEY); persistCodexLastUsed(acc.id);
  };

  const handleSaveCodexPool = (pool: CodexAccountPool) => { const next = [...codexPools.filter((p) => p.id !== pool.id), { ...pool, activatedAt: Date.now() }]; setCodexPools(next); saveCodexPools(next); };
  const handleDeleteCodexPool = (pool: CodexAccountPool) => { const next = codexPools.filter((p) => p.id !== pool.id); setCodexPools(next); saveCodexPools(next); };
  const handleApplyBestCodexPool = async (pool: CodexAccountPool) => {
    const best = pickBestCodexPoolMember(pool, codexAccounts, codexUsageCacheRef.current);
    if (best) await handleApplyCodexAccount(best.account, pool.model, pool.id);
  };

  const handleDeleteCodexAccount = async (acc: CodexAccount) => {
    const name = acc.label || "ChatGPT";
    setAccountPendingDelete({
      name,
      email: acc.email || null,
      onConfirm: async () => {
        const matchedId = acc.id; persistCodexLastUsed(matchedId); const list = codexAccounts.filter((a) => a.id !== acc.id); setCodexAccounts(list); saveCodexAccounts(list); saveAccountOrder(CODEX_ORDER_KEY, list.map((a) => a.id));
        const pools = reconcileCodexPools(codexPoolsRef.current, list); setCodexPools(pools); saveCodexPools(pools);
        const next = { ...codexModelCacheRef.current }; delete next[acc.id]; setCodexModelCache(next); saveCodexModelCache(next);
        if (activeCodexId === acc.id) {
          const nextAcc = list.length > 0 ? list[0] : null; setActiveCodexId(nextAcc?.id ?? null);
          if (nextAcc) { localStorage.setItem(CODEX_ACTIVE_ID_KEY, nextAcc.id); await handleApplyCodexAccount(nextAcc); }
          else { localStorage.removeItem(CODEX_ACTIVE_ID_KEY); }
        }
      },
    });
  };

  const fetchCodexModelCatalog = async (account: CodexAccount, force = false, isRetry = false): Promise<CodexModelCatalogCacheEntry> => {
    const previousEntry = codexModelCacheRef.current[account.id];
    if (!force && isCodexModelCacheFresh(previousEntry)) return previousEntry!;
    const rawKey = deobfuscate(account.apiKey);
    if (!rawKey.startsWith("{")) {
      const errMsg = "API-key accounts do not expose an account-scoped Codex model catalog";
      const entry: CodexModelCatalogCacheEntry = { accountId: account.id, planName: account.lastPlan ?? null, models: previousEntry?.models ?? [], fetchedAt: previousEntry?.fetchedAt ?? 0, error: errMsg };
      saveCodexModelCache({ ...codexModelCacheRef.current, [account.id]: entry }); setCodexModelCache((p) => ({ ...p, [account.id]: entry })); return entry;
    }
    const oauthData = JSON.parse(rawKey);
    try {
      const rawCatalog = await invoke<any>("fetch_chatgpt_models", { accessToken: oauthData.accessToken, accountId: oauthData.accountId, clientVersion: null });
      const entry: CodexModelCatalogCacheEntry = { accountId: account.id, planName: account.lastPlan ?? null, models: normalizeCodexModelCatalog(rawCatalog), fetchedAt: Date.now() };
      saveCodexModelCache({ ...codexModelCacheRef.current, [account.id]: entry }); setCodexModelCache((p) => ({ ...p, [account.id]: entry })); return entry;
    } catch (error) {
      if (!isRetry && oauthData.refreshToken) {
        try {
          const tok = await invoke<any>("refresh_chatgpt_token", { refreshToken: oauthData.refreshToken });
          oauthData.accessToken = tok.access_token; account.apiKey = obfuscate(JSON.stringify(oauthData));
          saveCodexAccounts(loadCodexAccounts().map((a) => a.id === account.id ? { ...a, apiKey: account.apiKey } : a));
          return await fetchCodexModelCatalog(account, true, true);
        } catch {}
      }
      const errMsg = String(error);
      const entry = { accountId: account.id, planName: account.lastPlan ?? null, models: previousEntry?.models ?? [], fetchedAt: previousEntry?.fetchedAt ?? 0, error: errMsg };
      saveCodexModelCache({ ...codexModelCacheRef.current, [account.id]: entry }); setCodexModelCache((p) => ({ ...p, [account.id]: entry })); return entry;
    }
  };

  const rescanAllCodexModels = async () => {
    const oauthAccounts = codexAccounts.filter((a) => { try { return deobfuscate(a.apiKey).startsWith("{"); } catch { return false; } });
    let completed = 0, failed = 0;
    for (let i = 0; i < oauthAccounts.length; i += 3) {
      const batch = oauthAccounts.slice(i, i + 3), res = await Promise.all(batch.map((a) => fetchCodexModelCatalog(a, true)));
      completed += res.length; failed += res.filter((r) => r.error).length;
      setCodexModelScanProgress({ running: true, total: oauthAccounts.length, completed, succeeded: completed - failed, failed });
    }
    const result = { completed, failed, total: oauthAccounts.length, succeeded: completed - failed };
    setCodexModelScanProgress({ running: false, ...result }); return result;
  };
  const handleRescanAllCodexModels = async () => { const result = await rescanAllCodexModels(); showToast(`Model scan: ${result.completed} scanned, ${result.failed} failed`); };

  const fetchAccountUsage = async (account: CodexAccount, force = false): Promise<any> => {
    if (!force && isUsageCacheFresh(codexUsageCacheRef.current[account.id])) return codexUsageCacheRef.current[account.id];
    try {
      const rawKey = deobfuscate(account.apiKey);
      if (rawKey.startsWith("{")) {
        const oauthData = JSON.parse(rawKey), usageData = await invoke<any>("fetch_chatgpt_usage", { accessToken: oauthData.accessToken, accountId: oauthData.accountId });
        const limits = usageData.rate_limit || {};
        const primary = limits.primary_window || null;
        const secondary = limits.secondary_window || limits.weekly_window || null;
        const monthly = limits.monthly_window || limits.month_window || null;
        const entry = { loading: false, fetchedAt: Date.now(), isOAuth: true, planName: usageData.plan_type || "Free", primary, secondary, monthly, rate_limit: limits };
        codexUsageCacheRef.current[account.id] = entry; setCodexUsageCache((p) => ({ ...p, [account.id]: entry })); return entry;
      }
      const snapshot = await fetchCodexUsageData(rawKey), entry = { loading: false, fetchedAt: Date.now(), isOAuth: false, planName: snapshot.planName, snapshot };
      codexUsageCacheRef.current[account.id] = entry as any; setCodexUsageCache((p) => ({ ...p, [account.id]: entry as any })); return entry;
    } catch { return null; }
  };

  const maybeAutoFailoverActiveCodexPool = async () => {
    const activePool = codexPools.find((p) => p.id === activeCodexPoolIdRef.current);
    if (!activePool) return;
    codexFailoverLatchRef.current[activePool.id] = Date.now();
    const failover = findCodexPoolFailover(activePool, activeCodexId, codexAccounts, codexUsageCache);
    if (failover) await handleApplyCodexAccount(failover.account, activePool.model, activePool.id);
  };

  const checkForUpdates = async () => {
    try {
      const currentVersion = await getVersion();
      const res = await fetch("https://api.github.com/repos/the-long-ride/QuotaShift/releases/latest");
      if (!res.ok) return;
      const releaseData = await res.json();
      const latestTag = releaseData.tag_name;
      if (!latestTag) return;
      const currentClean = currentVersion.replace(/^v/, "");
      const latestClean = latestTag.replace(/^v/, "");
      if (isNewerVersion(currentClean, latestClean)) { setUpdateAvailable(true); setUpdateTag(latestTag); }
    } catch (err) { console.error("Check for updates failed:", err); }
  };
  const triggerRefresh = async (force = false) => {
    setIsRefreshing(true);
    try {
      const s = await invoke<any>("force_refresh"); if (s) { setLastFullStatus(s); updateLocalSessionFromStatus(s); }
      const agAccounts = loadAntigravityAccounts();
      // 5. Eagerly fetch direct cloud quota for all Antigravity accounts
      await refreshAntigravityAccountsCloudFirst(agAccounts, true);
      checkForUpdates();
      const accounts = loadCodexAccounts(); await Promise.all(accounts.map((acc) => fetchAccountUsage(acc, force)));
      await maybeAutoFailoverActiveCodexPool();
    } catch (e) { console.error("Refresh error:", e); } finally { setIsRefreshing(false); }
  };

  const handleTrackAntigravityAccount = async (acc: AntigravityAccount) => {
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "antigravity"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, acc.id);
    setTrackedProvider("antigravity"); setTrackedAccountId(acc.id); setActiveAntigravityId(acc.id); localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, acc.id);
    await invoke("set_monitored_codex", { info: null }); await refreshAntigravityAccountsCloudFirst([acc], true);
  };
  // Codex action functions
  const handleTrackCodexAccount = async (acc: CodexAccount) => {
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "codex"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, acc.id);
    setTrackedProvider("codex"); setTrackedAccountId(acc.id); setActiveCodexId(acc.id); localStorage.setItem(CODEX_ACTIVE_ID_KEY, acc.id);
    const c = await fetchAccountUsage(acc, true);
    if (c) {
      const primary = c.primary || c.rate_limit?.primary_window, secondary = c.secondary || c.rate_limit?.secondary_window;
      await invoke("set_monitored_codex", { info: { accountId: acc.id, label: acc.label, primaryPercent: primary?.used_percent ? Math.max(0, 100 - primary.used_percent) : 100, primaryLabel: "5h", secondaryPercent: secondary?.used_percent ? Math.max(0, 100 - secondary.used_percent) : 100, secondaryLabel: "wk" } });
    }
  };
  const refreshTrackedAccountOnly = async (payload: any) => {
    if (payload?.provider === "antigravity") {
      const targetAcc = antigravityAccounts.find((a) => a.id === payload?.accountId) ?? antigravityAccounts[0];
      if (targetAcc) await refreshAntigravityAccountsCloudFirst([targetAcc], true);
    } else {
      const targetAcc = codexAccounts.find((a) => a.id === payload?.accountId) ?? codexAccounts[0];
      if (targetAcc) await fetchAccountUsage(targetAcc, true);
    }
  };
  const handleTrackClaude = () => { setTrackedProvider("claude"); setTrackedAccountId("claude-local"); localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "claude"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, "claude-local"); };

  const publishOverlayUpdate = useCallback(() => {
    const savedTrackedProvider = localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY), savedTrackedAccountId = localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY);
    const isClaudeTracked = savedTrackedProvider === "claude";
    const isCodexTracked = savedTrackedProvider === "codex" || (!isClaudeTracked && savedTrackedProvider !== "antigravity" && Boolean(lastFullStatus?.monitoredCodex));
    let prevOverlayData: OverlayAccountData | null = null;
    try { const raw = localStorage.getItem("quotashift_overlay_data"); if (raw) prevOverlayData = JSON.parse(raw); } catch {}
    let payload: OverlayAccountData;
    if (isClaudeTracked) {
      localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "claude"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, "claude-local");
      payload = buildClaudeOverlayPayload(claudeMonitorStatus, prevOverlayData); // provider: "claude"
    } else if (!isCodexTracked) {
      const acc = (savedTrackedAccountId ? antigravityAccounts.find((a) => a.id === savedTrackedAccountId) : null) ?? antigravityAccounts.find((a) => a.id === activeAntigravityId) ?? antigravityAccounts[0];
      if (acc) { localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "antigravity"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, acc.id); if (trackedAccountId !== acc.id) setTrackedAccountId(acc.id); }
      const cloudQuotas = (acc && antigravityUsageCache[acc.id]?.cloudQuotas) || acc?.cloudQuotas || [], quotaRows: import("./components/OverlayApp").OverlayQuotaRow[] = [];
      const gemini = cloudQuotas.find((q: any) => q.family === "gemini"), claudeOrOai = cloudQuotas.find((q: any) => q.family === "claude" || q.family === "open_ai");
      if (gemini) quotaRows.push({ label: "Gemini", fiveHourPercent: (gemini as any).fiveHourPercent ?? null, weeklyPercent: (gemini as any).weeklyPercent ?? null });
      if (claudeOrOai) quotaRows.push({ label: (claudeOrOai as any).family === "open_ai" ? "OpenAI" : "Claude", fiveHourPercent: (claudeOrOai as any).fiveHourPercent ?? null, weeklyPercent: (claudeOrOai as any).weeklyPercent ?? null });
      payload = buildAntigravityOverlayPayload(acc, quotaRows, prevOverlayData && prevOverlayData.provider === "antigravity" ? prevOverlayData : null);
    } else {
      const acc = (savedTrackedAccountId ? codexAccounts.find((a) => a.id === savedTrackedAccountId) : null) ?? codexAccounts.find((a) => a.id === activeCodexId) ?? codexAccounts[0];
      if (acc) { localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "codex"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, acc.id); if (trackedAccountId !== acc.id) setTrackedAccountId(acc.id); }
      const cache = (acc ? codexUsageCache[acc.id] : null) || ({} as any), windows = normalizeCodexUsageWindows(cache.rate_limit), reuse = prevOverlayData && prevOverlayData.provider === "codex";
      payload = {
        provider: "codex", accountId: acc?.id ?? "codex", label: acc?.label || acc?.email || "Codex", email: acc?.email || "ChatGPT",
        avatarUrl: acc?.profileUrl ? deobfuscate(acc.profileUrl) : null, tier: cache?.planName?.toUpperCase().includes("PRO") ? "PRO" : "FREE",
        fiveHourPercent: (windows.find((w: any) => w.durationMinutes === 300) as any)?.remainingPercent ?? (reuse ? (prevOverlayData?.fiveHourPercent ?? null) : null),
        weeklyPercent: (windows.find((w: any) => w.durationMinutes === 10080) as any)?.remainingPercent ?? (reuse ? (prevOverlayData?.weeklyPercent ?? null) : null),
        singleBars: windows.map((w: any) => ({ label: w.label, percent: Math.round(w.remainingPercent ?? 100 - w.usedPercent) })), loading: !cache,
      };
    }
    emit("overlay-data-update", payload); localStorage.setItem("quotashift_overlay_data", JSON.stringify(payload));
  }, [antigravityAccounts, codexAccounts, activeAntigravityId, activeCodexId, antigravityUsageCache, codexUsageCache, claudeMonitorStatus, trackedAccountId, lastFullStatus]);

  // Effect 1: Claude monitor polling (independent 2s timer)
  useEffect(() => {
    let cancelled = false;
    const refreshClaudeMonitor = async () => {
      try { const status = await invoke<ClaudeMonitorStatus>("get_claude_monitor_status"); if (!cancelled) setClaudeMonitorStatus(status); } catch {}
    };
    invoke<ClaudeMonitorStatus>("ensure_claude_statusline_bridge").then((status) => { if (!cancelled) setClaudeMonitorStatus(status); }).catch(() => {});
    const claudeMonitorTimer = window.setInterval(() => { void refreshClaudeMonitor(); }, 2000);
    return () => { cancelled = true; window.clearInterval(claudeMonitorTimer); };
  }, []);

  // Effect 2: Init — pool routing restore, initial usage fetch, keep-alive sync, update check
  useEffect(() => {
    const cxAccounts = loadCodexAccounts(); const cxPools = reconcileCodexPools(loadCodexPools(), cxAccounts);
    saveCodexPools(cxPools);
    const storedPoolId = localStorage.getItem(CODEX_ACTIVE_POOL_ID_KEY);
    setActiveCodexPoolId(storedPoolId && cxPools.some((p) => p.id === storedPoolId) ? storedPoolId : null);
    // Restore pool routing
    const restorePoolRouting = localStorage.getItem(CODEX_POOL_ROUTING_KEY) === "true";
    if (restorePoolRouting) {
      setPoolRoutingBusy(true);
      void (async () => {
        try {
          const started = await invoke<CodexRouterStatus>("start_codex_router");
          if (!started.running) throw new Error("router listener did not report running");
          const config = buildCodexRouterConfig({ accounts: cxAccounts, pools: cxPools, usageCache: {}, modelCache: codexModelCacheRef.current, appliedAccountId: activeCodexId, decodeCredential: deobfuscate });
          const configured = await invoke<CodexRouterStatus>("configure_codex_router", { config });
          if (!configured.running) throw new Error("router stopped during startup configuration");
          poolRoutingEnabledRef.current = true; setPoolRoutingEnabled(true); setRouterStatus(configured); localStorage.setItem(CODEX_POOL_ROUTING_KEY, "true");
        } catch (error) {
          try { await invoke("stop_codex_router"); } catch {}
          poolRoutingEnabledRef.current = false; setPoolRoutingEnabled(false); localStorage.setItem(CODEX_POOL_ROUTING_KEY, "false");
          showToast(`Failed to start Codex pool routing: ${error}`, "warning");
        } finally { setPoolRoutingBusy(false); }
      })();
    } else {
      invoke<CodexRouterStatus>("get_codex_router_status").then((status) => { setRouterStatus(status); }).catch(console.warn);
    }
    // Sync poll interval to backend
    const initialPollInterval = loadPollIntervalPreference();
    invoke("set_poll_interval", { seconds: BigInt(initialPollInterval) }).catch((err) => console.warn("Failed to initialize poll interval in backend:", err));
    // Restore tracked overlay account in backend
    const savedTrackedProvider = localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY);
    const savedTrackedAccountId = localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY);
    if (savedTrackedProvider === "codex") {
      const targetId = savedTrackedAccountId || activeCodexId || cxAccounts[0]?.id;
      const targetAcc = cxAccounts.find((a) => a.id === targetId);
      if (targetAcc) {
        const initialInfo: CodexMonitoredInfo = { accountId: targetAcc.id, label: targetAcc.label || targetAcc.email || "Codex", primaryPercent: null, primaryLabel: "5h", secondaryPercent: null, secondaryLabel: "wk" };
        invoke("set_monitored_codex", { info: initialInfo }).catch(console.warn);
      }
    } else if (savedTrackedProvider === "antigravity" || savedTrackedProvider === "claude") {
      invoke("set_monitored_codex", { info: null }).catch(console.warn);
    }
    // Eagerly fetch live usage for Codex accounts on startup
    Promise.all(cxAccounts.map((acc) => {
      setCodexUsageCache((prev) => ({ ...prev, [acc.id]: { ...prev[acc.id], loading: true, isOAuth: deobfuscate(acc.apiKey).startsWith("{") } }));
      return fetchAccountUsage(acc);
    })).then(async () => { await maybeAutoFailoverActiveCodexPool(); }).catch(console.error);
    // Eagerly fetch Antigravity cloud quotas
    const agAccounts = loadAntigravityAccounts();
    agAccounts.forEach((acc) => { setAntigravityUsageCache((prev) => ({ ...prev, [acc.id]: { ...prev[acc.id], loading: true, exactState: "idle", workerMessage: "Refreshing quota summary", error: undefined } })); });
    setTimeout(() => { lastRefreshTimeRef.current = Date.now(); refreshAntigravityAccountsCloudFirst(agAccounts, true).catch(console.error); }, 0);
    checkForUpdates();
    invoke<any>("get_keep_alive_status").then((status) => { if (status?.running !== undefined) handleToggleKeepAlive; /* sync state from backend */ }).catch(console.warn);
  }, []);

  // Effect 3: Router auto-reconfigure on dependency changes
  useEffect(() => {
    if (!poolRoutingEnabled) { if (routerConfigureTimerRef.current) clearTimeout(routerConfigureTimerRef.current); routerConfigureTimerRef.current = null; return; }
    if (routerConfigureTimerRef.current) clearTimeout(routerConfigureTimerRef.current);
    routerConfigureTimerRef.current = setTimeout(() => {
      const config = buildCodexRouterConfig({ accounts: codexAccounts, pools: codexPools, usageCache: codexUsageCache, modelCache: codexModelCache, appliedAccountId: activeCodexId, decodeCredential: deobfuscate });
      invoke<CodexRouterStatus>("configure_codex_router", { config }).then((status) => { setRouterStatus(status); }).catch((error) => console.warn("Failed to refresh Codex router snapshot", error));
    }, 150);
    return () => { if (routerConfigureTimerRef.current) clearTimeout(routerConfigureTimerRef.current); };
  }, [poolRoutingEnabled, codexAccounts, codexPools, codexUsageCache, codexModelCache, activeCodexId]);

  // Effect 4: Router status polling when routing is enabled
  useEffect(() => {
    if (!poolRoutingEnabled) return;
    let cancelled = false;
    const pollRouterStatus = async () => {
      try {
        const status = await invoke<CodexRouterStatus>("get_codex_router_status");
        if (cancelled) return;
        setRouterStatus(status);
        if (status && (status as any).routedRequestCount > lastSeenRouterRequestCountRef.current) {
          if ((status as any).lastRoutedAccountId) recordRoutedCodexUse((status as any).lastRoutedAccountId);
          lastSeenRouterRequestCountRef.current = (status as any).routedRequestCount;
        }
      } catch (error) { if (!cancelled) console.warn("Failed to poll Codex router status", error); }
    };
    void pollRouterStatus();
    const timer = setInterval(pollRouterStatus, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [poolRoutingEnabled]);

  // Effect 5: Tauri event listener setup
  useEffect(() => {
    let active = true;
    let unlistenStatus: (() => void) | null = null, unlistenWindow: (() => void) | null = null, unlistenWorker: (() => void) | null = null, unlistenRefreshUsage: (() => void) | null = null, unlistenOverlayVisibility: (() => void) | null = null;
    const setupListeners = async () => {
      const uStatus = await listen<FullStatus | null>("status-updated", (event) => {
        setLastFullStatus(event.payload); updateLocalSessionFromStatus(event.payload as any);
        const accounts = loadCodexAccounts();
        Promise.all(accounts.map((acc) => fetchAccountUsage(acc))).then(async () => { await maybeAutoFailoverActiveCodexPool(); }).catch(console.error);
        const agAccts = loadAntigravityAccounts();
        const minimumGap = Math.max(5000, pollIntervalRef.current * 1000);
        if (Date.now() - lastRefreshTimeRef.current >= minimumGap) {
          lastRefreshTimeRef.current = Date.now();
          refreshAntigravityAccountsCloudFirst(agAccts, true).catch(console.error);
        }
      });
      if (!active) { uStatus(); } else { unlistenStatus = uStatus; }

      const uWindow = await listen<boolean>("window-shown", () => {
        invoke<FullStatus | null>("get_quota_status").then((status) => {
          if (status?.monitoredCodex) { setActiveTab("codex"); } else { setActiveTab("antigravity"); }
        }).catch(console.error);
      });
      if (!active) { uWindow(); } else { unlistenWindow = uWindow; }

      const uWorker = await listen<AntigravityWorkerProgress>("antigravity-worker-progress", (event) => {
        const progress = event.payload;
        const isFinal = ["exact", "cached", "cloud_fallback", "error"].includes(progress.phase);
        setAntigravityUsageCache((previous) => ({ ...previous, [progress.accountId]: { ...previous[progress.accountId], loading: !isFinal, exactState: progress.phase, workerMessage: progress.message } }));
      });
      if (!active) { uWorker(); } else { unlistenWorker = uWorker; }

      const uRefreshUsage = await listen("request-refresh-usage", (event: any) => { refreshTrackedAccountOnly(event?.payload); });
      if (!active) { uRefreshUsage(); } else { unlistenRefreshUsage = uRefreshUsage; }

      const uOverlayVis = await listen<boolean>("overlay-visibility-changed", (_event) => { /* sync state from backend event */ });
      if (!active) { uOverlayVis(); } else { unlistenOverlayVisibility = uOverlayVis; }
    };
    setupListeners();
    return () => { active = false; unlistenStatus?.(); unlistenWindow?.(); unlistenWorker?.(); unlistenRefreshUsage?.(); unlistenOverlayVisibility?.(); };
  }, []);

  // Effect 6: Publish overlay update whenever dependencies change
  useEffect(() => { publishOverlayUpdate(); }, [publishOverlayUpdate]);

  // Effect 7: Restore overlay visibility on startup
  useEffect(() => { if (overlayEnabled) { invoke("set_overlay_visible", { visible: true }).catch(() => {}); } }, []);

  const handleExportBackup = async () => { setPassMode("export"); setPassOpen(true); };
  const handleImportBackup = async (content: string) => { setPendingBackup(content); setPassMode("import"); setPassOpen(true); };
  const handlePassphraseSubmit = async (passphrase: string) => {
    if (passMode === "export") {
      const data = { ...buildBackupData(antigravityAccounts, codexAccounts, isDarkMode ? "dark" : "light"), codex: { pools: loadCodexPools() } };
      const enc = await encryptBackup(data, passphrase), path = await invoke<string>("export_backup_file", { content: enc });
      showToast(`Backup exported to ${path}`, "info"); setPassOpen(false);
    } else if (pendingBackup) {
      try {
        const pData: any = await decryptBackup(pendingBackup, passphrase);
        if (Array.isArray(pData.pools)) {
          const importedIdMap = new Map(); reconcileCodexPools(normalizeCodexPools(pData.pools), codexAccounts); importedIdMap.clear();
        }
        showToast("Backup imported successfully", "info"); setPassOpen(false);
      } catch { showToast("Invalid passphrase or corrupted backup", "error"); }
    }
  };

  const handleCheckUpdate = async (latestTag = "v1.0.0") => { setUpdateAvailable(true); setUpdateTag(latestTag); /* manual download */ await openUrl(OFFICIAL_RELEASE_URL); };
  const handleSwitchBestAntigravity = async () => { const b = pickBestAntigravityAccount(antigravityAccounts, antigravityUsageCache); if (b && b.account.id !== activeAntigravityId) await handleApplyAntigravityAccount(b.account); };
  const handleSwitchBestCodex = async () => { const b = pickBestCodexAccount(codexAccounts, codexUsageCache); if (b && b.account.id !== activeCodexId) await handleApplyCodexAccount(b.account); };

  return (
    <div className="app-container">
      <Header
        updateAvailable={updateAvailable} updateTag={updateTag} isDownloadingUpdate={false} onTriggerUpdate={handleCheckUpdate} pollInterval={pollInterval} onPollIntervalChange={handlePollIntervalChange} isRefreshing={isRefreshing} onRefresh={() => triggerRefresh(true)} onExportBackup={handleExportBackup} onImportBackup={handleImportBackup} isDarkMode={isDarkMode} onToggleTheme={handleToggleTheme} isOnline={isOnline} statusText={statusText} keepAliveActive={keepAliveActive} onToggleKeepAlive={handleToggleKeepAlive} persistentWorkersEnabled={persistentWorkers} onTogglePersistentWorkers={handleTogglePersistentWorkers} codexModelScanProgress={codexModelScanProgress} onRescanAllCodexModels={handleRescanAllCodexModels} overlayEnabled={overlayEnabled} onToggleOverlay={handleToggleOverlay}
      />
      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === "antigravity" ? "tab-btn--active" : ""}`} onClick={() => setActiveTab("antigravity")} data-tab="antigravity" data-tooltip="Switch to the Antigravity accounts tab">
          <img className="tab-brand-icon tab-brand-icon--ag-dark" src="https://antigravity.google/assets/image/brand/antigravity-icon__white.png" alt="Antigravity" /><img className="tab-brand-icon tab-brand-icon--ag-light" src="https://antigravity.google/assets/image/brand/antigravity-icon__one-color.png" alt="Antigravity" />Antigravity
        </button>
        <button className={`tab-btn ${activeTab === "codex" ? "tab-btn--active" : ""}`} onClick={() => setActiveTab("codex")} data-tab="codex" data-tooltip="Switch to the ChatGPT Codex accounts tab">
          <svg className="tab-brand-icon tab-brand-icon--codex" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" fillRule="evenodd" clipRule="evenodd" strokeLinejoin="round" strokeMiterlimit="2"><path d="M474.123 209.81c11.525-34.577 7.569-72.423-10.838-103.904-27.696-48.168-83.433-72.94-137.794-61.414a127.14 127.14 0 00-95.475-42.49c-55.564 0-104.936 35.781-122.139 88.593-35.781 7.397-66.574 29.76-84.637 61.414-27.868 48.167-21.503 108.72 15.826 150.007-11.525 34.578-7.569 72.424 10.838 103.733 27.696 48.34 83.433 73.111 137.966 61.585 24.084 27.18 58.833 42.835 95.303 42.663 55.564 0 104.936-35.782 122.139-88.594 35.782-7.397 66.574-29.76 84.465-61.413 28.04-48.168 21.676-108.722-15.654-150.008v-.172zm-39.567-87.218c11.01 19.267 15.139 41.803 11.354 63.65-.688-.516-2.064-1.204-2.924-1.72l-101.152-58.49a16.965 16.965 0 00-16.687 0L206.621 194.5v-50.232l97.883-56.597c45.587-26.32 103.732-10.666 130.052 34.921zm-227.935 104.42l49.888-28.9 49.887 28.9v57.63l-49.887 28.9-49.888-28.9v-57.63zm23.223-191.81c22.364 0 43.867 7.742 61.07 22.02-.688.344-2.064 1.204-3.097 1.72L186.666 117.26c-5.161 2.925-8.258 8.43-8.258 14.45v136.934l-43.523-25.116V130.333c0-52.64 42.491-95.13 95.131-95.302l-.172.172zM52.14 168.697c11.182-19.268 28.557-34.062 49.544-41.803V247.14c0 6.02 3.097 11.354 8.258 14.45l118.354 68.295-43.695 25.288-97.711-56.425c-45.415-26.32-61.07-84.465-34.75-130.052zm26.665 220.71c-11.182-19.095-15.139-41.802-11.354-63.65.688.516 2.064 1.204 2.924 1.72l101.152 58.49a16.965 16.965 0 0016.687 0l118.354-68.467v50.232l-97.883 56.425c-45.587 26.148-103.732 10.665-130.052-34.75h.172zm204.54 87.39c-22.192 0-43.867-7.741-60.898-22.02a62.439 62.439 0 003.097-1.72l101.152-58.317c5.16-2.924 8.429-8.43 8.257-14.45V243.527l43.523 25.116v113.022c0 52.64-42.663 95.303-95.131 95.303v-.172zM461.22 343.303c-11.182 19.267-28.729 34.061-49.544 41.63V264.687c0-6.021-3.097-11.526-8.257-14.45L284.893 181.77l43.523-25.116 97.883 56.424c45.587 26.32 61.07 84.466 34.75 130.053l.172.172z" fill="currentColor" /></svg>ChatGPT Codex
        </button>
        <button className={`tab-btn ${activeTab === "claude" ? "tab-btn--active" : ""}`} onClick={() => setActiveTab("claude")} data-tab="claude" data-tooltip="Switch to the Claude local session tab">
          <ClaudeLogo size={12} className="tab-brand-icon" />Claude
        </button>
      </div>
      {activeTab === "antigravity" ? (
        <AntigravityTab
          accounts={antigravityAccounts} activeId={activeAntigravityId} appliedId={activeAntigravityId} trackedAccountId={trackedAccountId} trackedProvider={trackedProvider} lastFullStatus={lastFullStatus} localSession={localAntigravitySession} antigravityUsageCache={antigravityUsageCache} onApply={handleApplyAntigravityAccount} onDelete={handleDeleteAntigravityAccount} onRename={(acc, label) => { const list = antigravityAccounts.map((a) => (a.id === acc.id ? { ...a, label } : a)); saveAntigravityAccounts(list); setAntigravityAccounts(list); }} onTrack={handleTrackAntigravityAccount} onRefreshQuota={(acc) => refreshAntigravityAccountsCloudFirst([acc], true)} onSwitchBest={handleSwitchBestAntigravity} onReorder={(ids) => { saveAccountOrder(ANTIGRAVITY_ORDER_KEY, ids); setAntigravityAccounts((p) => sortByOrder(p, ids)); }} onAddAccountClick={() => setAddAgOpen(true)} onAddLocalSessionToMonitored={handleAddLocalSessionToMonitored}
        />
      ) : activeTab === "codex" ? (
        <CodexTab
          accounts={codexAccounts} activeId={activeCodexId} appliedId={activeCodexId} trackedAccountId={trackedAccountId} trackedProvider={trackedProvider} lastFullStatus={lastFullStatus} codexUsageCache={codexUsageCache} pools={codexPools} activePoolId={activeCodexPoolId} onApply={(acc) => handleApplyCodexAccount(acc)} onDelete={handleDeleteCodexAccount} onRename={(acc, label) => { const list = codexAccounts.map((a) => (a.id === acc.id ? { ...a, label } : a)); saveCodexAccounts(list); setCodexAccounts(list); }} onTrack={handleTrackCodexAccount} onSelect={(acc) => { setActiveCodexId(acc.id); localStorage.setItem(CODEX_ACTIVE_ID_KEY, acc.id); }} onRefresh={async (acc) => { setCodexUsageCache((p) => ({ ...p, [acc.id]: { ...p[acc.id], loading: true } })); await fetchAccountUsage(acc, true); }} onSwitchBest={handleSwitchBestCodex} onReorder={(ids) => { saveAccountOrder(CODEX_ORDER_KEY, ids); setCodexAccounts((p) => sortByOrder(p, ids)); }} onAddAccountClick={() => setIsCodexModalOpen(true)} onNewPool={() => { setEditingPool(null); setPoolModalOpen(true); }} onEditPool={(p) => { setEditingPool(p); setPoolModalOpen(true); }} onDeletePool={handleDeleteCodexPool} onApplyPool={handleApplyBestCodexPool} poolRoutingEnabled={poolRoutingEnabled} poolRoutingBusy={poolRoutingBusy} routerStatus={routerStatus} onTogglePoolRouting={handleToggleCodexPoolRouting} codexModelCache={codexModelCache} onRescanModels={async (account) => { await fetchCodexModelCatalog(account, true); }}
        />
      ) : (
        <ClaudeTab status={claudeMonitorStatus} isTracked={trackedProvider === "claude"} onTrackClaude={handleTrackClaude} />
      )}
      {/* Antigravity Modal */}
      <AddAntigravityAccountModal
        isOpen={addAgOpen} onClose={() => setAddAgOpen(false)} onAccountAdded={async (id) => { const target = antigravityAccounts.find((a) => a.id === id); if (target) await refreshAntigravityAccountsCloudFirst([target], true); }} loadAccounts={loadAntigravityAccounts} saveAccounts={saveAntigravityAccounts} setActiveAccountId={(id) => { setActiveAntigravityId(id); localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, id); }} onLocalSessionCaptured={handleLocalAntigravitySessionCaptured}
      />
      {/* Export / Import Passphrase Modal */}
      {passOpen && <PassphraseModal mode={passMode} onSubmit={handlePassphraseSubmit} onCancel={() => setPassOpen(false)} />}
      {poolModalOpen && (
        <CodexPoolModal
          isOpen={poolModalOpen} initialPool={editingPool} accounts={codexAccounts} modelCache={codexModelCache} onRequestModelScan={(acc) => fetchCodexModelCatalog(acc)} onSave={handleSaveCodexPool} onClose={() => setPoolModalOpen(false)}
        />
      )}
      {isCodexModalOpen && (
        <AddAccountModal
          isOpen={isCodexModalOpen} onClose={() => setIsCodexModalOpen(false)} onAccountAdded={async (id) => { setActiveCodexId(id); localStorage.setItem(CODEX_ACTIVE_ID_KEY, id); const target = loadCodexAccounts().find((a) => a.id === id); if (target) await fetchAccountUsage(target, true); }} showAlert={async (m) => showToast(m, "info")} loadAccounts={loadCodexAccounts} saveAccounts={(accs) => { saveCodexAccounts(accs); setCodexAccounts(accs); }} onStartFetching={(id, isOAuth) => { setCodexUsageCache((p) => ({ ...p, [id]: { loading: true, isOAuth } })); }}
        />
      )}
      {accountPendingDelete && (
        <CustomDialog
          title="Remove Account"
          message={`Are you sure you want to remove ${
            accountPendingDelete.email && accountPendingDelete.name && accountPendingDelete.name !== accountPendingDelete.email
              ? `"${accountPendingDelete.name}" (${accountPendingDelete.email})`
              : accountPendingDelete.name
                ? `"${accountPendingDelete.name}"`
                : accountPendingDelete.email
                  ? `"${accountPendingDelete.email}"`
                  : "this account"
          } from QuotaShift?`}
          isConfirm
          confirmText="Delete"
          confirmVariant="danger"
          messageAlign="left"
          onClose={(confirmed) => {
            if (confirmed) {
              const run = accountPendingDelete.onConfirm;
              setAccountPendingDelete(null);
              void run();
            } else {
              setAccountPendingDelete(null);
            }
          }}
        />
      )}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
      <Tooltip />
    </div>
  );
};
