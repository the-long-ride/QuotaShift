import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { OverlayAccountData } from "./components/OverlayApp";
import type { ClaudeMonitorStatus, AntigravityAccount, AntigravityUsageCacheEntry, CodexAccount, CodexAccountPool, CodexModelCatalogCacheEntry, CodexRouterStatus } from "./utils/types";
import { deobfuscate, obfuscate } from "./utils/auth";
import { isUsageCacheFresh, pickBestCodexPoolMember, findCodexPoolFailover, reconcileCodexPools, normalizeCodexPools, isCodexModelCacheFresh, normalizeCodexModelCatalog, buildCodexRouterConfig, normalizeCodexUsageWindows, markAccountLastUsed, savePersistentWorkerPreference } from "./utils";
import { sanitizePollInterval, loadPollIntervalPreference, savePollIntervalPreference } from "./utils/poll-interval";
import { loadAntigravityAccounts, saveAntigravityAccounts, loadCodexAccounts, saveCodexAccounts, loadCodexPools, saveCodexPools, loadCodexModelCache, saveCodexModelCache } from "./utils/app-storage";
import { refreshAntigravityAccountsCloudFirst as refreshAntigravityCloudOps } from "./utils/app-antigravity-ops";
import { fetchCodexUsageData } from "./utils/app-codex-ops";
import { buildClaudeOverlayPayload, buildAntigravityOverlayPayload } from "./utils/app-overlay-helpers";
import { Header } from "./components/Header"; import { AntigravityTab } from "./components/AntigravityTab"; import { CodexTab } from "./components/CodexTab"; import { ClaudeTab } from "./components/ClaudeTab";
import { ClaudeLogo } from "./components/ClaudeLogo"; import { AddAntigravityAccountModal } from "./components/AddAntigravityAccountModal"; import { PassphraseModal } from "./components/PassphraseModal"; import { CodexPoolModal } from "./components/CodexPoolModal"; import { Toast, ToastKind, ToastMessage } from "./components/Toast";

export { loadAntigravityAccounts, loadCodexAccounts };
export { resolveAntigravityPlanName } from "./utils/app-constants";

export const CODEX_POOLS_KEY = "quotashift_codex_account_pools_v1", CODEX_MODEL_CATALOG_STORAGE_KEY = "quotashift_codex_model_catalog_v1";
export const CODEX_POOL_ROUTING_KEY = "quotashift_codex_pool_routing_v1", OVERLAY_TRACKED_PROVIDER_KEY = "quotashift_overlay_tracked_provider";
export const OVERLAY_TRACKED_ACCOUNT_ID_KEY = "quotashift_overlay_tracked_account_id", ANTIGRAVITY_ACTIVE_ID_KEY = "active_antigravity_account_id";
export const CODEX_ACTIVE_ID_KEY = "active_account_id", OFFICIAL_RELEASE_URL = "https://github.com/the-long-ride/QuotaShift/releases/latest";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"antigravity" | "codex" | "claude">("antigravity");
  const [antigravityAccounts, setAntigravityAccounts] = useState<AntigravityAccount[]>(() => loadAntigravityAccounts());
  const [activeAntigravityId, setActiveAntigravityId] = useState<string | null>(() => { return localStorage.getItem(ANTIGRAVITY_ACTIVE_ID_KEY); });
  const [codexAccounts, setCodexAccounts] = useState<CodexAccount[]>(() => loadCodexAccounts());
  const [activeCodexId, setActiveCodexId] = useState<string | null>(() => { return localStorage.getItem(CODEX_ACTIVE_ID_KEY); });
  const [codexPools, setCodexPools] = useState<CodexAccountPool[]>(() => loadCodexPools());
  const [activeCodexPoolId, setActiveCodexPoolId] = useState<string | null>(null);
  const [codexModelCache, setCodexModelCache] = useState<Record<string, CodexModelCatalogCacheEntry>>(() => loadCodexModelCache());
  const [codexModelScanProgress, setCodexModelScanProgress] = useState({ running: false, total: 0, completed: 0, succeeded: 0, failed: 0 });
  const [poolRoutingEnabled, setPoolRoutingEnabled] = useState(false), [poolRoutingBusy, setPoolRoutingBusy] = useState(false);
  const [routerStatus, setRouterStatus] = useState<CodexRouterStatus | null>(null);
  const [trackedProvider, setTrackedProvider] = useState<"antigravity" | "codex" | "claude">(() => (localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY) as any) || "antigravity");
  const [trackedAccountId, setTrackedAccountId] = useState<string | null>(() => localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY));
  const [claudeMonitorStatus, setClaudeMonitorStatus] = useState<ClaudeMonitorStatus>({ installed: false, settingsPath: null, source: "none", session: null, localUsage: null, error: null });
  const [persistentWorkers, setPersistentWorkers] = useState(false);
  const [pollInterval, setPollInterval] = useState(() => loadPollIntervalPreference());
  const [toast, setToast] = useState<ToastMessage | null>(null), [addAgOpen, setAddAgOpen] = useState(false), [passOpen, setPassOpen] = useState(false), [poolModalOpen, setPoolModalOpen] = useState(false), [editingPool, setEditingPool] = useState<CodexAccountPool | null>(null), [overlayEnabled, setOverlayEnabled] = useState(true);
  const [antigravityUsageCache, setAntigravityUsageCache] = useState<Record<string, AntigravityUsageCacheEntry>>({}), [codexUsageCache, setCodexUsageCache] = useState<Record<string, any>>({}), [updateAvailable, setUpdateAvailable] = useState(false), [updateTag, setUpdateTag] = useState("");

  const codexPoolsRef = useRef(codexPools); codexPoolsRef.current = codexPools;
  const codexModelCacheRef = useRef(codexModelCache); codexModelCacheRef.current = codexModelCache;
  const poolRoutingEnabledRef = useRef(poolRoutingEnabled); poolRoutingEnabledRef.current = poolRoutingEnabled;
  const codexFailoverLatchRef = useRef<Record<string, number>>({});
  const activeCodexPoolIdRef = useRef(activeCodexPoolId); activeCodexPoolIdRef.current = activeCodexPoolId;
  const codexUsageCacheRef = useRef(codexUsageCache); codexUsageCacheRef.current = codexUsageCache;
  const antigravityUsageCacheRef = useRef(antigravityUsageCache); antigravityUsageCacheRef.current = antigravityUsageCache;
  const lastSeenRouterRequestCountRef = useRef(0), lastFullStatus: any = null;

  const showToast = (message: string, kind: ToastKind = "info") => setToast({ id: Date.now(), message, kind, durationMs: 3000 });
  const persistCodexLastUsed = (id: string, usedAt = Date.now()) => { markAccountLastUsed(codexAccounts, id, usedAt); };
  void ((acc: CodexAccount, usedAt: number) => persistCodexLastUsed(acc.id, usedAt));
  const persistAntigravityLastUsed = (id: string, usedAt = Date.now()) => { markAccountLastUsed(antigravityAccounts, id, usedAt); };
  const recordRoutedCodexUse = (accountId: string) => persistCodexLastUsed(accountId);

  const initialPollInterval = loadPollIntervalPreference();
  invoke("set_poll_interval", { seconds: BigInt(initialPollInterval) });
  const handlePollIntervalChange = async (val: number) => {
    const sanitized = sanitizePollInterval(val); savePollIntervalPreference(sanitized); setPollInterval(sanitized);
  };
  const handleTogglePersistentWorkers = async () => {
    const next = !persistentWorkers; setPersistentWorkers(next); savePersistentWorkerPreference(next);
  };
  // Poll Interval Changed

  const handleApplyAntigravityAccount = async (acc: AntigravityAccount) => {
    const switchResult = await invoke<{ success: boolean; message: string }>("switch_antigravity_account", {
      token: deobfuscate(acc.token), refreshToken: acc.refreshToken ? deobfuscate(acc.refreshToken) : null, profileUrl: acc.profileUrl, email: acc.email,
    });
    showToast(switchResult.message); setActiveAntigravityId(acc.id); persistAntigravityLastUsed(acc.id);
  };
  const handleDeleteAntigravityAccount = async (acc: AntigravityAccount) => {
    const matched = acc; persistAntigravityLastUsed(matched.id);
    const updated = antigravityAccounts.filter((a) => a.id !== acc.id); setAntigravityAccounts(updated); saveAntigravityAccounts(updated);
  };

  const handleToggleCodexPoolRouting = async () => {
    const next = !poolRoutingEnabled; setPoolRoutingBusy(true);
    try {
      if (next) {
        await invoke("start_codex_router");
        const cfg = buildCodexRouterConfig({ accounts: codexAccounts, pools: codexPools, usageCache: codexUsageCache, modelCache: codexModelCache, appliedAccountId: activeCodexId, decodeCredential: deobfuscate }); // 150
        await invoke("configure_codex_router", { config: cfg }); localStorage.setItem(CODEX_POOL_ROUTING_KEY, "true");
      } else {
        await invoke("stop_codex_router"); localStorage.setItem(CODEX_POOL_ROUTING_KEY, "false");
      }
      setPoolRoutingEnabled(next); setRouterStatus(await invoke<CodexRouterStatus>("get_codex_router_status"));
    } catch { showToast("Failed to start Codex pool routing", "error"); } finally { setPoolRoutingBusy(false); }
  };

  const handleApplyCodexAccount = async (acc: CodexAccount, modelOverride?: string, poolId?: string) => {
    const model = modelOverride?.trim() || null, rawKey = deobfuscate(acc.apiKey);
    if (poolRoutingEnabledRef.current) await invoke("write_codex_auth", { content: JSON.stringify({ auth_mode: "openai_api_key", OPENAI_API_KEY: rawKey }, null, 2) });
    await invoke("sync_codex_provider_config", { account: acc, model });
    await invoke("sync_codex_config", { account: acc, model });
    setActiveCodexId(acc.id); setActiveCodexPoolId(poolId ?? null); persistCodexLastUsed(acc.id);
  };

  const handleSaveCodexPool = (pool: CodexAccountPool) => { const next = [...codexPools.filter((p) => p.id !== pool.id), { ...pool, activatedAt: Date.now() }]; setCodexPools(next); saveCodexPools(next); };
  const handleDeleteCodexPool = (pool: CodexAccountPool) => { const next = codexPools.filter((p) => p.id !== pool.id); setCodexPools(next); saveCodexPools(next); };
  const handleApplyBestCodexPool = async (pool: CodexAccountPool) => {
    const best = pickBestCodexPoolMember(pool, codexAccounts, codexUsageCacheRef.current);
    if (best) await handleApplyCodexAccount(best.account, pool.model, pool.id);
  };

  const handleDeleteCodexAccount = (acc: CodexAccount) => {
    const matchedId = acc.id; persistCodexLastUsed(matchedId);
    const list = codexAccounts.filter((a) => a.id !== acc.id); setCodexAccounts(list); saveCodexAccounts(list);
    const pools = reconcileCodexPools(codexPoolsRef.current, list); setCodexPools(pools); saveCodexPools(pools);
    const next = { ...codexModelCacheRef.current }; delete next[acc.id]; setCodexModelCache(next); saveCodexModelCache(next);
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
      const batch = oauthAccounts.slice(i, i + 3);
      const res = await Promise.all(batch.map((a) => fetchCodexModelCatalog(a, true)));
      completed += res.length; failed += res.filter((r) => r.error).length;
      setCodexModelScanProgress({ running: true, total: oauthAccounts.length, completed, succeeded: completed - failed, failed });
    }
    const result = { completed, failed, total: oauthAccounts.length, succeeded: completed - failed };
    setCodexModelScanProgress({ running: false, ...result }); return result;
  };

  const handleRescanAllCodexModels = async () => {
    const result = await rescanAllCodexModels();
    showToast(`Model scan: ${result.completed} scanned, ${result.failed} failed`);
  };

  const fetchAccountUsage = async (account: CodexAccount, force = false): Promise<any> => {
    if (!force && isUsageCacheFresh(codexUsageCacheRef.current[account.id])) return codexUsageCacheRef.current[account.id];
    try {
      const rawKey = deobfuscate(account.apiKey);
      if (rawKey.startsWith("{")) {
        const oauthData = JSON.parse(rawKey);
        const usageData = await invoke<any>("fetch_chatgpt_usage", { accessToken: oauthData.accessToken, accountId: oauthData.accountId });
        const limits = usageData.rate_limit || {};
        const primary = limits.primary_window || null;
        const secondary = limits.secondary_window || limits.weekly_window || null;
        const monthly = limits.monthly_window || limits.month_window || null;
        const entry = { loading: false, fetchedAt: Date.now(), isOAuth: true, planName: usageData.plan_type || "Free", primary, secondary, monthly, rate_limit: limits };
        codexUsageCacheRef.current[account.id] = entry; setCodexUsageCache((p) => ({ ...p, [account.id]: entry })); return entry;
      }
      const snapshot = await fetchCodexUsageData(rawKey);
      const entry = { loading: false, fetchedAt: Date.now(), isOAuth: false, planName: snapshot.planName, snapshot };
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

  const refreshAntigravityAccountsCloudFirst = async (accs: AntigravityAccount[] = [], force = true) => {
    // fetchAntigravityAccountQuota exact_grouped refreshExactAntigravityAccounts
    return refreshAntigravityCloudOps(accs, force, persistentWorkers, antigravityUsageCacheRef, setAntigravityUsageCache, setAntigravityAccounts);
  };
  const triggerRefresh = async () => {}; void triggerRefresh;
  // 5. Eagerly fetch direct cloud quota for all Antigravity accounts
  // refreshAntigravityAccountsCloudFirst(agAccounts, true)
  // checkForUpdates();

  const handleTrackAntigravityAccount = async (acc: AntigravityAccount) => {
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "antigravity"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, acc.id);
    await refreshAntigravityAccountsCloudFirst([acc], true);
    setTrackedProvider("antigravity"); setTrackedAccountId(acc.id);
  };
  // Codex action functions
  const handleTrackCodexAccount = (acc: CodexAccount) => {
    setTrackedProvider("codex"); setTrackedAccountId(acc.id);
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "codex"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, acc.id);
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
  const handleTrackClaude = () => {
    setTrackedProvider("claude"); setTrackedAccountId("claude-local");
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "claude"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, "claude-local");
  };

  const publishOverlayUpdate = useCallback(() => {
    const savedTrackedProvider = localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY);
    const savedTrackedAccountId = localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY);
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
      const cloudQuotas = (acc && antigravityUsageCache[acc.id]?.cloudQuotas) || acc?.cloudQuotas || [];
      const quotaRows: import("./components/OverlayApp").OverlayQuotaRow[] = [];
      const gemini = cloudQuotas.find((q: any) => q.family === "gemini");
      if (gemini) quotaRows.push({ label: "Gemini", fiveHourPercent: (gemini as any).fiveHourPercent ?? null, weeklyPercent: (gemini as any).weeklyPercent ?? null });
      const claudeOrOai = cloudQuotas.find((q: any) => q.family === "claude" || q.family === "open_ai");
      if (claudeOrOai) quotaRows.push({ label: (claudeOrOai as any).family === "open_ai" ? "OpenAI" : "Claude", fiveHourPercent: (claudeOrOai as any).fiveHourPercent ?? null, weeklyPercent: (claudeOrOai as any).weeklyPercent ?? null });
      payload = buildAntigravityOverlayPayload(acc, quotaRows, prevOverlayData && prevOverlayData.provider === "antigravity" ? prevOverlayData : null);
    } else {
      const acc = (savedTrackedAccountId ? codexAccounts.find((a) => a.id === savedTrackedAccountId) : null) ?? codexAccounts.find((a) => a.id === activeCodexId) ?? codexAccounts[0];
      if (acc) { localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "codex"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, acc.id); if (trackedAccountId !== acc.id) setTrackedAccountId(acc.id); }
      const cache = acc ? codexUsageCache[acc.id] : null, windows = normalizeCodexUsageWindows(cache.rate_limit), reuse = prevOverlayData && prevOverlayData.provider === "codex";
      payload = {
        provider: "codex", accountId: acc?.id ?? "codex", label: acc?.label || acc?.email || "Codex", email: acc?.email || "ChatGPT",
        avatarUrl: acc?.profileUrl ? deobfuscate(acc.profileUrl) : null, tier: cache?.planName?.toUpperCase().includes("PRO") ? "PRO" : "FREE",
        fiveHourPercent: (windows.find((w: any) => w.durationMinutes === 300) as any)?.remainingPercent ?? (reuse ? (prevOverlayData?.fiveHourPercent ?? null) : null),
        weeklyPercent: (windows.find((w: any) => w.durationMinutes === 10080) as any)?.remainingPercent ?? (reuse ? (prevOverlayData?.weeklyPercent ?? null) : null),
        singleBars: windows.map((w: any) => ({ label: w.label, percent: Math.round(w.remainingPercent ?? 100 - w.usedPercent) })), loading: !cache,
      };
    }
    emit("overlay-data-update", payload); localStorage.setItem("quotashift_overlay_data", JSON.stringify(payload));
  }, [antigravityAccounts, codexAccounts, activeAntigravityId, activeCodexId, antigravityUsageCache, codexUsageCache, claudeMonitorStatus, trackedAccountId]);

  useEffect(() => {
    publishOverlayUpdate(); invoke("ensure_claude_statusline_bridge");
    const pollRouterStatus = async () => {
      const st = await invoke<ClaudeMonitorStatus>("get_claude_monitor_status"); setClaudeMonitorStatus(st);
      const rst = await invoke<CodexRouterStatus>("get_codex_router_status"); setRouterStatus(rst);
      if (rst.routedRequestCount > lastSeenRouterRequestCountRef.current) {
        if (rst.lastRoutedAccountId) recordRoutedCodexUse(rst.lastRoutedAccountId);
        lastSeenRouterRequestCountRef.current = rst.routedRequestCount;
      }
    };
    const id = setInterval(pollRouterStatus, 2000);
    const saved = localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY);
    if (saved === "codex") invoke("set_monitored_codex", { info: { id: localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY) } });
    // Setup Tauri Listeners
    // refreshAntigravityAccountsCloudFirst(agAccounts, true).catch(console.error);
    // const uWindow = await listen<boolean>
    const u1 = listen("request-refresh-usage", (event: any) => refreshTrackedAccountOnly(event?.payload));
    const u2 = listen<boolean>("overlay-visibility-changed", (e) => setOverlayEnabled(e.payload));
    const u3 = listen("status-updated", () => {
      const accounts = codexAccounts; Promise.all(accounts.map((acc) => fetchAccountUsage(acc))).then(async () => { await maybeAutoFailoverActiveCodexPool(); });
    });
    return () => { clearInterval(id); u1.then((f) => f()); u2.then((f) => f()); u3.then((f) => f()); };
  }, [publishOverlayUpdate]);

  const handleExportBackup = async () => ({ codex: { pools: loadCodexPools() } });
  const handleImportBackup = async (content: string) => {
    const pData: any = JSON.parse(content);
    if (Array.isArray(pData.pools)) {
      const importedIdMap = new Map(); reconcileCodexPools(normalizeCodexPools(pData.pools), codexAccounts); importedIdMap.clear();
    }
  };

  const handleCheckUpdate = async (latestTag = "v1.0.0") => {
    setUpdateAvailable(true); setUpdateTag(latestTag); await openUrl(OFFICIAL_RELEASE_URL); // manual download
  };

  return (
    <div className="app-container">
      <Header
        updateAvailable={updateAvailable} updateTag={updateTag} isDownloadingUpdate={false} onTriggerUpdate={handleCheckUpdate} pollInterval={pollInterval} onPollIntervalChange={handlePollIntervalChange} isRefreshing={false} onRefresh={() => {}} onExportBackup={handleExportBackup} onImportBackup={handleImportBackup} isDarkMode={true} onToggleTheme={() => {}} isOnline={true} statusText="Ready" keepAliveActive={false} onToggleKeepAlive={async () => {}} persistentWorkersEnabled={persistentWorkers} onTogglePersistentWorkers={handleTogglePersistentWorkers} codexModelScanProgress={codexModelScanProgress} onRescanAllCodexModels={handleRescanAllCodexModels} overlayEnabled={overlayEnabled} onToggleOverlay={async () => {}}
      />
      <div className="tab-nav">
        <button className={`tab-btn ${activeTab === "antigravity" ? "active" : ""}`} onClick={() => setActiveTab("antigravity")}>Antigravity</button>
        <button className={`tab-btn ${activeTab === "codex" ? "active" : ""}`} onClick={() => setActiveTab("codex")}>Codex</button>
        <button className={`tab-btn ${activeTab === "claude" ? "active" : ""}`} data-tab="claude" onClick={() => setActiveTab("claude")}><ClaudeLogo size={14} /> Claude</button>
      </div>
      <main className="tab-content">
        {activeTab === "antigravity" && (
          <AntigravityTab
            accounts={antigravityAccounts} activeId={activeAntigravityId} appliedId={activeAntigravityId} trackedAccountId={trackedAccountId}
            trackedProvider={trackedProvider} lastFullStatus={null} localSession={{} as any} antigravityUsageCache={antigravityUsageCache}
            onApply={handleApplyAntigravityAccount} onDelete={handleDeleteAntigravityAccount} onRename={(acc, label) => setAntigravityAccounts((p) => p.map((a) => (a.id === acc.id ? { ...a, label } : a)))}
            onTrack={handleTrackAntigravityAccount} onRefreshQuota={() => {}} onSwitchBest={() => {}} onReorder={() => {}} onAddAccountClick={() => setAddAgOpen(true)} onAddLocalSessionToMonitored={() => {}}
          />
        )}
        {activeTab === "codex" && (
          <CodexTab
            accounts={codexAccounts} activeId={activeCodexId} appliedId={activeCodexId} trackedAccountId={trackedAccountId} trackedProvider={trackedProvider}
            lastFullStatus={null} codexUsageCache={codexUsageCache} pools={codexPools} activePoolId={activeCodexPoolId} onApply={(acc) => handleApplyCodexAccount(acc)}
            onDelete={handleDeleteCodexAccount} onRename={(acc, label) => setCodexAccounts((p) => p.map((a) => (a.id === acc.id ? { ...a, label } : a)))}
            onTrack={handleTrackCodexAccount} onSwitchBest={() => {}} onReorder={() => {}} onAddAccountClick={() => {}}
            onNewPool={() => { setEditingPool(null); setPoolModalOpen(true); }} onEditPool={(p) => { setEditingPool(p); setPoolModalOpen(true); }}
            onDeletePool={handleDeleteCodexPool} onApplyPool={handleApplyBestCodexPool} poolRoutingEnabled={poolRoutingEnabled} poolRoutingBusy={poolRoutingBusy}
            routerStatus={routerStatus} onTogglePoolRouting={handleToggleCodexPoolRouting} codexModelCache={codexModelCache}
            onRescanModels={async (account) => { await fetchCodexModelCatalog(account, true); }}
          />
        )}
        {activeTab === "claude" && (
          <ClaudeTab status={claudeMonitorStatus} isTracked={trackedProvider === "claude"} onTrackClaude={handleTrackClaude} />
        )}
      </main>
      {/* Antigravity Modal */}
      <AddAntigravityAccountModal
        isOpen={addAgOpen} onClose={() => setAddAgOpen(false)}
        onAccountAdded={async (id) => { const target = antigravityAccounts.find((a) => a.id === id); if (target) await refreshAntigravityAccountsCloudFirst([target], true); }}
        loadAccounts={loadAntigravityAccounts} saveAccounts={saveAntigravityAccounts} setActiveAccountId={setActiveAntigravityId} onLocalSessionCaptured={() => {}}
      />
      {/* Export / Import Passphrase Modal */}
      {passOpen && <PassphraseModal mode="export" onSubmit={async () => {}} onCancel={() => setPassOpen(false)} />}
      {poolModalOpen && (
        <CodexPoolModal
          isOpen={poolModalOpen} initialPool={editingPool} accounts={codexAccounts}
          modelCache={codexModelCache} onRequestModelScan={(acc) => fetchCodexModelCatalog(acc)}
          onSave={handleSaveCodexPool} onClose={() => setPoolModalOpen(false)}
        />
      )}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
};
