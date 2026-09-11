import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core"; import { listen, emit } from "@tauri-apps/api/event"; import { openUrl } from "@tauri-apps/plugin-opener"; import { getVersion } from "@tauri-apps/api/app";
import type { OverlayAccountData, OverlayQuotaRow } from "./components/overlay/OverlayApp"; import type { ClaudeMonitorStatus, AntigravityAccount, AntigravityUsageCacheEntry, AntigravityWorkerProgress, CodexAccount, CodexAccountPool, CodexModelCatalogCacheEntry, CodexRouterStatus, FullStatus } from "./utils/common/types";
import { deobfuscate, obfuscate, decodeJwtProfile } from "./utils/auth/auth"; import { isUsageCacheFresh, pickBestCodexPoolMember, findCodexPoolFailover, reconcileCodexPools, normalizeCodexPools, isCodexModelCacheFresh, normalizeCodexModelCatalog, buildCodexRouterConfig, normalizeCodexUsageWindows, markAccountLastUsed, savePersistentWorkerPreference, pickBestAntigravityAccount, pickBestCodexAccount, classifyCodexTier, isCodexAccountOAuth } from "./utils";
import { sanitizePollInterval, loadPollIntervalPreference, savePollIntervalPreference } from "./utils/common/poll-interval"; import { loadCardLayoutModePreference, saveCardLayoutModePreference } from "./utils/common/card-layout-mode"; import { loadAntigravityAccounts, saveAntigravityAccounts, loadCodexAccounts, saveCodexAccounts, loadCodexPools, saveCodexPools, loadCodexModelCache, saveCodexModelCache } from "./utils/common/app-storage";
import { refreshAntigravityAccountsCloudFirst as refreshAntigravityCloudOps } from "./utils/antigravity/app-antigravity-ops"; import { fetchCodexUsageData } from "./utils/codex/app-codex-ops"; import { buildClaudeOverlayPayload, buildAntigravityOverlayPayload } from "./utils/common/app-overlay-helpers"; import { saveAccountOrder, sortByOrder } from "./utils/account/account-order"; import { buildBackupData, encryptBackup, decryptBackup } from "./utils/common/app-backup"; import { isNewerVersion } from "./utils/common/update-policy";
import { Header } from "./components/common/Header"; import { AntigravityTab } from "./components/antigravity/AntigravityTab"; import { CodexTab } from "./components/codex/CodexTab"; import { ClaudeTab } from "./components/claude/ClaudeTab"; import { ClaudeLogo } from "./components/claude/ClaudeLogo";
import { AddAccountModal } from "./components/codex/AddAccountModal"; import { AddAntigravityAccountModal } from "./components/antigravity/AddAntigravityAccountModal"; import { PassphraseModal } from "./components/common/PassphraseModal"; import { CodexPoolModal } from "./components/codex/CodexPoolModal"; import { CustomDialog } from "./components/common/CustomDialog"; import { Toast, ToastKind, ToastMessage } from "./components/common/Toast"; import { Tooltip } from "./components/common/Tooltip"; import { useLocalSession } from "./hooks/useLocalSession"; import { useAppThemeAndOverlay } from "./hooks/useAppThemeAndOverlay";
import { extractAntigravitySessionAccount } from "./utils/antigravity/current-local-session"; import { parseCodexLocalAuth, buildCodexAuthContent } from "./utils/codex/current-local-session"; import { findAntigravityAccountMatch, findCodexAccountMatch, upsertAccountById } from "./utils/account/current-account"; import { resolveRefreshedAvatarUrl } from "./utils/account/account-avatar";

export { loadAntigravityAccounts, loadCodexAccounts };
export { resolveAntigravityPlanName } from "./utils/common/app-constants";
export const CODEX_POOLS_KEY = "quotashift_codex_account_pools_v1", CODEX_ACTIVE_POOL_ID_KEY = "quotashift_codex_active_pool_id_v1", CODEX_MODEL_CATALOG_STORAGE_KEY = "quotashift_codex_model_catalog_v1", CODEX_POOL_ROUTING_KEY = "quotashift_codex_pool_routing_v1";
export const OVERLAY_TRACKED_PROVIDER_KEY = "quotashift_overlay_tracked_provider", OVERLAY_TRACKED_ACCOUNT_ID_KEY = "quotashift_overlay_tracked_account_id", ANTIGRAVITY_ACTIVE_ID_KEY = "antigravity-active-id", CODEX_ACTIVE_ID_KEY = "antigravity-codex-active-id", OFFICIAL_RELEASE_URL = "https://github.com/the-long-ride/QuotaShift/releases/latest", THEME_KEY = "antigravity-theme", KEEP_ALIVE_KEY = "keepAliveActive", OVERLAY_ENABLED_KEY = "quotashift_overlay_enabled", ANTIGRAVITY_ORDER_KEY = "antigravity-account-order", CODEX_ORDER_KEY = "antigravity-codex-account-order";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"antigravity" | "codex" | "claude">("antigravity"), [antigravityAccounts, setAntigravityAccounts] = useState<AntigravityAccount[]>(() => loadAntigravityAccounts()), [activeAntigravityId, setActiveAntigravityId] = useState<string | null>(() => localStorage.getItem(ANTIGRAVITY_ACTIVE_ID_KEY)), [codexAccounts, setCodexAccounts] = useState<CodexAccount[]>(() => loadCodexAccounts()), [activeCodexId, setActiveCodexId] = useState<string | null>(() => localStorage.getItem(CODEX_ACTIVE_ID_KEY)), [codexPools, setCodexPools] = useState<CodexAccountPool[]>(() => loadCodexPools()), [activeCodexPoolId, setActiveCodexPoolId] = useState<string | null>(() => localStorage.getItem(CODEX_ACTIVE_POOL_ID_KEY)), [codexModelCache, setCodexModelCache] = useState<Record<string, CodexModelCatalogCacheEntry>>(() => loadCodexModelCache());
  const [codexModelScanProgress, setCodexModelScanProgress] = useState({ running: false, total: 0, completed: 0, succeeded: 0, failed: 0 }), [poolRoutingEnabled, setPoolRoutingEnabled] = useState(false), [poolRoutingBusy, setPoolRoutingBusy] = useState(false), [routerStatus, setRouterStatus] = useState<CodexRouterStatus | null>(null), [trackedProvider, setTrackedProvider] = useState<"antigravity" | "codex" | "claude">(() => (localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY) as any) || "antigravity");
  const [trackedAccountId, setTrackedAccountId] = useState<string | null>(() => localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY)); const [claudeMonitorStatus, setClaudeMonitorStatus] = useState<ClaudeMonitorStatus>({ installed: false, settingsPath: null, source: "none", session: null, localUsage: null, error: null }), [persistentWorkers, setPersistentWorkers] = useState(false);
  const [pollInterval, setPollInterval] = useState(() => loadPollIntervalPreference());
  const [searchQuery, setSearchQuery] = useState(""), [toast, setToast] = useState<ToastMessage | null>(null), [cardLayoutMode, setCardLayoutMode] = useState<"compact" | "expanded">(() => loadCardLayoutModePreference()), [addAgOpen, setAddAgOpen] = useState(false), [isCodexModalOpen, setIsCodexModalOpen] = useState(false), [passOpen, setPassOpen] = useState(false), [passMode, setPassMode] = useState<"export" | "import">("export"), [pendingBackup, setPendingBackup] = useState<string | null>(null), [exportSuccessPath, setExportSuccessPath] = useState<string | null>(null), [poolModalOpen, setPoolModalOpen] = useState(false), [editingPool, setEditingPool] = useState<CodexAccountPool | null>(null), [antigravityUsageCache, setAntigravityUsageCache] = useState<Record<string, AntigravityUsageCacheEntry>>({}), [codexUsageCache, setCodexUsageCache] = useState<Record<string, any>>({}), [updateAvailable, setUpdateAvailable] = useState(false), [updateTag, setUpdateTag] = useState(""), [isRefreshing, setIsRefreshing] = useState(false), [lastFullStatus, setLastFullStatus] = useState<any>(null), [accountPendingDelete, setAccountPendingDelete] = useState<{ name: string; email?: string | null; onConfirm: () => Promise<void> | void } | null>(null), [accountPendingApply, setAccountPendingApply] = useState<{ title: string; message: string; onConfirm: () => Promise<void> | void } | null>(null), [trackingCurrentProvider, setTrackingCurrentProvider] = useState<"antigravity" | "codex" | null>(null);
  const { isDarkMode, handleToggleTheme, keepAliveActive, handleToggleKeepAlive, overlayEnabled, handleToggleOverlay, isOnline, statusText } = useAppThemeAndOverlay();
  const codexPoolsRef = useRef(codexPools); codexPoolsRef.current = codexPools; const codexModelCacheRef = useRef(codexModelCache); codexModelCacheRef.current = codexModelCache; const poolRoutingEnabledRef = useRef(poolRoutingEnabled); poolRoutingEnabledRef.current = poolRoutingEnabled; const codexFailoverLatchRef = useRef<Record<string, number>>({});
  const activeCodexPoolIdRef = useRef(activeCodexPoolId); activeCodexPoolIdRef.current = activeCodexPoolId; const codexUsageCacheRef = useRef(codexUsageCache); codexUsageCacheRef.current = codexUsageCache; const antigravityUsageCacheRef = useRef(antigravityUsageCache); antigravityUsageCacheRef.current = antigravityUsageCache; const lastSeenRouterRequestCountRef = useRef(0);
  const routerConfigureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null), pollIntervalRef = useRef(pollInterval); pollIntervalRef.current = pollInterval; const lastRefreshTimeRef = useRef(0);
  const handleCardLayoutModeChange = (m: "compact" | "expanded") => { setCardLayoutMode(m); saveCardLayoutModePreference(m); }; useEffect(() => { document.documentElement.setAttribute("data-card-mode", cardLayoutMode); }, [cardLayoutMode]);
  const showToast = (message: string, kind: ToastKind = "info") => setToast({ id: Date.now(), message, kind, durationMs: 3000 }); const persistCodexLastUsed = (id: string, usedAt = Date.now()) => { markAccountLastUsed(codexAccounts, id, usedAt); }; void ((acc: CodexAccount, usedAt: number) => persistCodexLastUsed(acc.id, usedAt)); const persistAntigravityLastUsed = (id: string, usedAt = Date.now()) => { markAccountLastUsed(antigravityAccounts, id, usedAt); }; const recordRoutedCodexUse = (accountId: string) => persistCodexLastUsed(accountId);
  const refreshAntigravityAccountsCloudFirst = async (accs: AntigravityAccount[] = [], force = true) => refreshAntigravityCloudOps(accs, force, persistentWorkers, antigravityUsageCacheRef, setAntigravityUsageCache, setAntigravityAccounts);
  const { localAntigravitySession, updateLocalSessionFromStatus, handleLocalAntigravitySessionCaptured, handleAddLocalSessionToMonitored, handleApplyAccountToLocalSession } = useLocalSession(antigravityAccounts, setAntigravityAccounts, refreshAntigravityAccountsCloudFirst);
  const handleTogglePersistentWorkers = async () => { const next = !persistentWorkers; setPersistentWorkers(next); savePersistentWorkerPreference(next); }; // Poll Interval Changed
  const handlePollIntervalChange = async (val: number) => { const sanitized = sanitizePollInterval(val); savePollIntervalPreference(sanitized); setPollInterval(sanitized); await invoke("set_poll_interval", { seconds: BigInt(sanitized) }); };

  const handleApplyAntigravityAccount = async (acc: AntigravityAccount, skipConfirm = false) => {
    const doApply = async () => {
      const switchResult = await invoke<{ success: boolean; message: string }>("switch_antigravity_account", { token: deobfuscate(acc.token), refreshToken: acc.refreshToken ? deobfuscate(acc.refreshToken) : null, profileUrl: acc.profileUrl, email: acc.email });
      showToast(switchResult.message); setActiveAntigravityId(acc.id); localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, acc.id); persistAntigravityLastUsed(acc.id); handleApplyAccountToLocalSession(acc); void triggerRefresh(true);
    };
    if (skipConfirm) { await doApply(); return; }
    setAccountPendingApply({ title: "Apply Antigravity Account", message: `Applying "${acc.label || acc.email || "this account"}" will kill all current Antigravity processes (CLI / IDE / Desktop App) to switch credentials. Do you want to continue?`, onConfirm: doApply });
  };
  const handleDeleteAntigravityAccount = async (acc: AntigravityAccount) => {
    setAccountPendingDelete({ name: acc.label || "Antigravity", email: acc.email || null, onConfirm: async () => {
      const matched = acc; persistAntigravityLastUsed(matched.id); const updated = antigravityAccounts.filter((a) => a.id !== acc.id); setAntigravityAccounts(updated); saveAntigravityAccounts(updated); saveAccountOrder(ANTIGRAVITY_ORDER_KEY, updated.map((a) => a.id));
      if (activeAntigravityId === acc.id) { const nextId = updated[0]?.id ?? null; setActiveAntigravityId(nextId); if (nextId) localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, nextId); else localStorage.removeItem(ANTIGRAVITY_ACTIVE_ID_KEY); }
    } });
  };
  const handleToggleCodexPoolRouting = async () => {
    const next = !poolRoutingEnabled; setPoolRoutingBusy(true);
    try {
      if (next) {
        await invoke("start_codex_router"); const cfg = buildCodexRouterConfig({ accounts: codexAccounts, pools: codexPools, usageCache: codexUsageCache, modelCache: codexModelCache, appliedAccountId: activeCodexId, decodeCredential: deobfuscate }); // 150
        await invoke("configure_codex_router", { config: cfg }); localStorage.setItem(CODEX_POOL_ROUTING_KEY, "true");
      } else { await invoke("stop_codex_router"); localStorage.setItem(CODEX_POOL_ROUTING_KEY, "false"); }
      setPoolRoutingEnabled(next); setRouterStatus(await invoke<CodexRouterStatus>("get_codex_router_status"));
    } catch { showToast("Failed to start Codex pool routing", "error"); } finally { setPoolRoutingBusy(false); }
  };
  const handleApplyCodexAccount = async (acc: CodexAccount, modelOverride?: string, poolId?: string, skipConfirm = false) => {
    const model = modelOverride?.trim() || null, rawKey = deobfuscate(acc.apiKey);
    const doApply = async () => {
      try {
        await invoke("kill_codex_processes");
        if (poolRoutingEnabledRef.current) await invoke("write_codex_auth", { content: JSON.stringify({ auth_mode: "openai_api_key", OPENAI_API_KEY: rawKey }, null, 2) }); else await invoke("write_codex_auth", { content: buildCodexAuthContent(rawKey) });
        await invoke("sync_codex_provider_config", { account: acc, model }).catch(() => {}); await invoke("sync_codex_config", { account: acc, model }).catch(() => {});
        setActiveCodexId(acc.id); setActiveCodexPoolId(poolId ?? null); localStorage.setItem(CODEX_ACTIVE_ID_KEY, acc.id);
        if (poolId) localStorage.setItem(CODEX_ACTIVE_POOL_ID_KEY, poolId); else localStorage.removeItem(CODEX_ACTIVE_POOL_ID_KEY); persistCodexLastUsed(acc.id); showToast(`Applied Codex account: ${acc.label || acc.email || "ChatGPT"}`);
      } catch (err) { showToast(`Failed to apply Codex account: ${String(err)}`, "error"); }
    };
    if (skipConfirm) { await doApply(); return; } setAccountPendingApply({ title: "Apply Codex Account", message: `Applying "${acc.label || acc.email || "this account"}" will kill all current Codex processes (Codex CLI, ChatGPT desktop app, and IDE extension) to switch credentials. Do you want to continue?`, onConfirm: doApply });
  };
  const handleSaveCodexPool = (pool: CodexAccountPool) => { const next = [...codexPools.filter((p) => p.id !== pool.id), { ...pool, activatedAt: Date.now() }]; setCodexPools(next); saveCodexPools(next); setPoolModalOpen(false); }; const handleDeleteCodexPool = (pool: CodexAccountPool) => { const next = codexPools.filter((p) => p.id !== pool.id); setCodexPools(next); saveCodexPools(next); };
  const handleApplyBestCodexPool = async (pool: CodexAccountPool) => { const best = pickBestCodexPoolMember(pool, codexAccounts, codexUsageCacheRef.current); if (best) await handleApplyCodexAccount(best.account, pool.model, pool.id); };

  const handleDeleteCodexAccount = async (acc: CodexAccount) => {
    setAccountPendingDelete({ name: acc.label || "ChatGPT", email: acc.email || null, onConfirm: async () => {
      const matchedId = acc.id; persistCodexLastUsed(matchedId); const list = codexAccounts.filter((a) => a.id !== acc.id); setCodexAccounts(list); saveCodexAccounts(list); saveAccountOrder(CODEX_ORDER_KEY, list.map((a) => a.id));
      const pools = reconcileCodexPools(codexPoolsRef.current, list); setCodexPools(pools); saveCodexPools(pools); const next = { ...codexModelCacheRef.current }; delete next[acc.id]; setCodexModelCache(next); saveCodexModelCache(next);
      if (activeCodexId === acc.id) { const nextAcc = list[0] ?? null; setActiveCodexId(nextAcc?.id ?? null); if (nextAcc) { localStorage.setItem(CODEX_ACTIVE_ID_KEY, nextAcc.id); await handleApplyCodexAccount(nextAcc); } else localStorage.removeItem(CODEX_ACTIVE_ID_KEY); }
    } });
  };

  const fetchCodexModelCatalog = async (account: CodexAccount, force = false, isRetry = false): Promise<CodexModelCatalogCacheEntry> => {
    const previousEntry = codexModelCacheRef.current[account.id]; if (!force && isCodexModelCacheFresh(previousEntry)) return previousEntry!;
    const rawKey = deobfuscate(account.apiKey);
    if (!rawKey.startsWith("{")) {
      const entry: CodexModelCatalogCacheEntry = { accountId: account.id, planName: account.lastPlan ?? null, models: previousEntry?.models ?? [], fetchedAt: previousEntry?.fetchedAt ?? 0, error: "API-key accounts do not expose an account-scoped Codex model catalog" }; saveCodexModelCache({ ...codexModelCacheRef.current, [account.id]: entry }); setCodexModelCache((p) => ({ ...p, [account.id]: entry })); return entry;
    }
    const oauthData = JSON.parse(rawKey);
    try {
      const rawCatalog = await invoke<any>("fetch_chatgpt_models", { accessToken: oauthData.accessToken, accountId: oauthData.accountId, clientVersion: null }), entry: CodexModelCatalogCacheEntry = { accountId: account.id, planName: account.lastPlan ?? null, models: normalizeCodexModelCatalog(rawCatalog), fetchedAt: Date.now() };
      saveCodexModelCache({ ...codexModelCacheRef.current, [account.id]: entry }); setCodexModelCache((p) => ({ ...p, [account.id]: entry })); return entry;
    } catch (error) {
      if (!isRetry && oauthData.refreshToken) {
        try {
          const tok = await invoke<any>("refresh_chatgpt_token", { refreshToken: oauthData.refreshToken }); oauthData.accessToken = tok.access_token; account.apiKey = obfuscate(JSON.stringify(oauthData));
          saveCodexAccounts(loadCodexAccounts().map((a) => a.id === account.id ? { ...a, apiKey: account.apiKey } : a)); return await fetchCodexModelCatalog(account, true, true);
        } catch {}
      }
      const errMsg = String(error), entry = { accountId: account.id, planName: account.lastPlan ?? null, models: previousEntry?.models ?? [], fetchedAt: previousEntry?.fetchedAt ?? 0, error: errMsg };
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
  }; const handleRescanAllCodexModels = async () => { const result = await rescanAllCodexModels(); showToast(`Model scan: ${result.completed} scanned, ${result.failed} failed`); };

  const fetchAccountUsage = async (account: CodexAccount, force = false): Promise<any> => {
    if (!force && isUsageCacheFresh(codexUsageCacheRef.current[account.id])) return codexUsageCacheRef.current[account.id];
    try {
      const rawKey = deobfuscate(account.apiKey);
      if (rawKey.startsWith("{")) {
        const oauthData = JSON.parse(rawKey), profile = decodeJwtProfile(oauthData.idToken || oauthData.accessToken);
        const nextAvatar = profile?.picture ? resolveRefreshedAvatarUrl(account.profileUrl, profile.picture, deobfuscate, obfuscate) : account.profileUrl;
        if (nextAvatar !== account.profileUrl) { account.profileUrl = nextAvatar; const updated = loadCodexAccounts().map((a) => (a.id === account.id ? { ...a, profileUrl: nextAvatar } : a)); saveCodexAccounts(updated); setCodexAccounts(updated); }
        const usageData = await invoke<any>("fetch_chatgpt_usage", { accessToken: oauthData.accessToken, accountId: oauthData.accountId }), limits = usageData.rate_limit || {};
        const primary = limits.primary_window || null; const secondary = limits.secondary_window || limits.weekly_window || null; const monthly = limits.monthly_window || limits.month_window || null;
        const entry = { loading: false, fetchedAt: Date.now(), isOAuth: true, planName: usageData.plan_type || "Free", primary, secondary, monthly, rate_limit: limits };
        codexUsageCacheRef.current[account.id] = entry; setCodexUsageCache((p) => ({ ...p, [account.id]: entry })); return entry;
      }
      const snapshot = await fetchCodexUsageData(rawKey), entry = { loading: false, fetchedAt: Date.now(), isOAuth: false, planName: snapshot.planName, snapshot };
      codexUsageCacheRef.current[account.id] = entry as any; setCodexUsageCache((p) => ({ ...p, [account.id]: entry as any })); return entry;
    } catch { return null; }
  };

  const maybeAutoFailoverActiveCodexPool = async () => {
    const activePool = codexPools.find((p) => p.id === activeCodexPoolIdRef.current); if (!activePool) return;
    codexFailoverLatchRef.current[activePool.id] = Date.now();
    const failover = findCodexPoolFailover(activePool, activeCodexId, codexAccounts, codexUsageCache);
    if (failover) await handleApplyCodexAccount(failover.account, activePool.model, activePool.id);
  };

  const checkForUpdates = async () => {
    try {
      const currentVersion = await getVersion(), res = await fetch("https://api.github.com/repos/the-long-ride/QuotaShift/releases/latest");
      if (!res.ok) return;
      const latestTag = (await res.json()).tag_name;
      if (latestTag && isNewerVersion(currentVersion.replace(/^v/, ""), latestTag.replace(/^v/, ""))) { setUpdateAvailable(true); setUpdateTag(latestTag); }
    } catch (err) { console.error("Check for updates failed:", err); }
  };
  const triggerRefresh = async (force = false) => {
    setIsRefreshing(true);
    try {
      const s = await invoke<any>("force_refresh"); if (s) { setLastFullStatus(s); updateLocalSessionFromStatus(s); }
      await refreshAntigravityAccountsCloudFirst(loadAntigravityAccounts(), true); checkForUpdates();
      await Promise.all(loadCodexAccounts().map((acc) => fetchAccountUsage(acc, force))); await maybeAutoFailoverActiveCodexPool();
    } catch (e) { console.error("Refresh error:", e); } finally { setIsRefreshing(false); }
  };

  const handleTrackAntigravityAccount = async (acc: AntigravityAccount) => {
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "antigravity"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, acc.id); setTrackedProvider("antigravity"); setTrackedAccountId(acc.id); await invoke("set_monitored_codex", { info: null }); await refreshAntigravityAccountsCloudFirst([acc], true);
  };
  const handleTrackCodexAccount = async (acc: CodexAccount) => {
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "codex"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, acc.id); setTrackedProvider("codex"); setTrackedAccountId(acc.id);
    const c = await fetchAccountUsage(acc, true); if (c) { const p = c.primary || c.rate_limit?.primary_window, s = c.secondary || c.rate_limit?.secondary_window; await invoke("set_monitored_codex", { info: { accountId: acc.id, label: acc.label, primaryPercent: p?.used_percent ? Math.max(0, 100 - p.used_percent) : 100, primaryLabel: "5h", secondaryPercent: s?.used_percent ? Math.max(0, 100 - s.used_percent) : 100, secondaryLabel: "wk" } }); }
  };
  const refreshTrackedAccountOnly = async (payload: any) => {
    if (payload?.provider === "antigravity") {
      const targetAcc = antigravityAccounts.find((a) => a.id === payload?.accountId) ?? antigravityAccounts[0]; if (targetAcc) await refreshAntigravityAccountsCloudFirst([targetAcc], true);
    } else { const targetAcc = codexAccounts.find((a) => a.id === payload?.accountId) ?? codexAccounts[0]; if (targetAcc) await fetchAccountUsage(targetAcc, true); }
  };
  const handleTrackClaude = () => { setTrackedProvider("claude"); setTrackedAccountId("claude-local"); localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "claude"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, "claude-local"); };

  const publishOverlayUpdate = useCallback(() => {
    const savedTrackedProvider = localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY), savedTrackedAccountId = localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY), isClaudeTracked = savedTrackedProvider === "claude";
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
      const cloudQuotas = (acc && antigravityUsageCache[acc.id]?.cloudQuotas) || acc?.cloudQuotas || [], quotaRows: OverlayQuotaRow[] = [];
      const gemini = cloudQuotas.find((q: any) => q.family === "gemini"), claudeOrOai = cloudQuotas.find((q: any) => q.family === "claude" || q.family === "open_ai");
      if (gemini) quotaRows.push({ label: "Gemini", fiveHourPercent: (gemini as any).fiveHourPercent ?? null, weeklyPercent: (gemini as any).weeklyPercent ?? null });
      if (claudeOrOai) quotaRows.push({ label: (claudeOrOai as any).family === "open_ai" ? "OpenAI" : "Claude", fiveHourPercent: (claudeOrOai as any).fiveHourPercent ?? null, weeklyPercent: (claudeOrOai as any).weeklyPercent ?? null });
      payload = buildAntigravityOverlayPayload(acc, quotaRows, prevOverlayData && prevOverlayData.provider === "antigravity" ? prevOverlayData : null);
    } else {
      const acc = (savedTrackedAccountId ? codexAccounts.find((a) => a.id === savedTrackedAccountId) : null) ?? codexAccounts.find((a) => a.id === activeCodexId) ?? codexAccounts[0];
      if (acc) { localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "codex"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, acc.id); if (trackedAccountId !== acc.id) setTrackedAccountId(acc.id); }
      const cache = (acc ? codexUsageCache[acc.id] : null) || ({} as any), windows = normalizeCodexUsageWindows(cache.rate_limit), reuse = prevOverlayData && prevOverlayData.provider === "codex", tier = cache?.planName?.toUpperCase().includes("PRO") ? "PRO" : "FREE";
      payload = { provider: "codex", accountId: acc?.id ?? "codex", label: acc?.label || acc?.email || "Codex", email: acc?.email || "ChatGPT", avatarUrl: acc?.profileUrl ? deobfuscate(acc.profileUrl) : null, tier,
        fiveHourPercent: (windows.find((w: any) => w.durationMinutes === 300) as any)?.remainingPercent ?? (reuse ? (prevOverlayData?.fiveHourPercent ?? null) : null),
        weeklyPercent: (windows.find((w: any) => w.durationMinutes === 10080) as any)?.remainingPercent ?? (reuse ? (prevOverlayData?.weeklyPercent ?? null) : null),
        singleBars: windows.map((w: any) => { const l = (w.label || "").toLowerCase(), lbl = l.includes("month") ? "MO" : l.includes("5h") ? "5H" : l.includes("week") ? "WK" : w.label; return { label: lbl, percent: Math.round(w.remainingPercent ?? 100 - w.usedPercent) }; }), loading: !cache,
        resetCount: cache?.rate_limit?.reset_credits?.available_count ?? null };
    }
    emit("overlay-data-update", payload); localStorage.setItem("quotashift_overlay_data", JSON.stringify(payload));
  }, [antigravityAccounts, codexAccounts, activeAntigravityId, activeCodexId, antigravityUsageCache, codexUsageCache, claudeMonitorStatus, trackedAccountId, lastFullStatus]);

  // Effect 1: Claude monitor polling (independent 2s timer)
  useEffect(() => {
    let cancelled = false; invoke<ClaudeMonitorStatus>("ensure_claude_statusline_bridge").then((s) => { if (!cancelled) setClaudeMonitorStatus(s); }).catch(() => {});
    const timer = setInterval(async () => { try { const s = await invoke<ClaudeMonitorStatus>("get_claude_monitor_status"); if (!cancelled) setClaudeMonitorStatus(s); } catch {} }, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const cxAccounts = loadCodexAccounts(), cxPools = reconcileCodexPools(loadCodexPools(), cxAccounts); saveCodexPools(cxPools);
    const storedPoolId = localStorage.getItem(CODEX_ACTIVE_POOL_ID_KEY); setActiveCodexPoolId(storedPoolId && cxPools.some((p) => p.id === storedPoolId) ? storedPoolId : null);
    if (localStorage.getItem(CODEX_POOL_ROUTING_KEY) === "true") {
      setPoolRoutingBusy(true);
      void (async () => {
        try {
          const started = await invoke<CodexRouterStatus>("start_codex_router"); if (!started.running) throw new Error("router listener did not report running");
          const config = buildCodexRouterConfig({ accounts: cxAccounts, pools: cxPools, usageCache: {}, modelCache: codexModelCacheRef.current, appliedAccountId: activeCodexId, decodeCredential: deobfuscate }), configured = await invoke<CodexRouterStatus>("configure_codex_router", { config });
          if (!configured.running) throw new Error("router stopped during startup configuration");
          poolRoutingEnabledRef.current = true; setPoolRoutingEnabled(true); setRouterStatus(configured); localStorage.setItem(CODEX_POOL_ROUTING_KEY, "true");
        } catch (error) {
          try { await invoke("stop_codex_router"); } catch {}
          poolRoutingEnabledRef.current = false; setPoolRoutingEnabled(false); localStorage.setItem(CODEX_POOL_ROUTING_KEY, "false");
          showToast(`Failed to start Codex pool routing: ${error}`, "warning");
        } finally { setPoolRoutingBusy(false); }
      })();
    } else invoke<CodexRouterStatus>("get_codex_router_status").then((status) => { setRouterStatus(status); }).catch(console.warn);
    const initialPollInterval = loadPollIntervalPreference();
    invoke("set_poll_interval", { seconds: BigInt(initialPollInterval) }).catch(console.warn);
    const savedTrackedProvider = localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY), savedTrackedAccountId = localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY);
    if (savedTrackedProvider === "codex") {
      const targetAcc = cxAccounts.find((a) => a.id === (savedTrackedAccountId || activeCodexId || cxAccounts[0]?.id));
      if (targetAcc) invoke("set_monitored_codex", { info: { accountId: targetAcc.id, label: targetAcc.label || targetAcc.email || "Codex", primaryPercent: null, primaryLabel: "5h", secondaryPercent: null, secondaryLabel: "wk" } }).catch(console.warn);
    } else if (savedTrackedProvider === "antigravity" || savedTrackedProvider === "claude") invoke("set_monitored_codex", { info: null }).catch(console.warn);
    Promise.all(cxAccounts.map((acc) => { setCodexUsageCache((p) => ({ ...p, [acc.id]: { ...p[acc.id], loading: true, isOAuth: deobfuscate(acc.apiKey).startsWith("{") } })); return fetchAccountUsage(acc); })).then(maybeAutoFailoverActiveCodexPool).catch(console.error);
    const agAccounts = loadAntigravityAccounts(); agAccounts.forEach((acc) => { setAntigravityUsageCache((p) => ({ ...p, [acc.id]: { ...p[acc.id], loading: true, exactState: "idle", workerMessage: "Refreshing quota summary" } })); });
    setTimeout(() => { lastRefreshTimeRef.current = Date.now(); refreshAntigravityAccountsCloudFirst(agAccounts, true).catch(console.error); }, 0);
    checkForUpdates(); invoke<any>("get_keep_alive_status").then((status) => { if (status?.running !== undefined) handleToggleKeepAlive; }).catch(console.warn);
  }, []);

  useEffect(() => {
    if (!poolRoutingEnabled) { if (routerConfigureTimerRef.current) clearTimeout(routerConfigureTimerRef.current); routerConfigureTimerRef.current = null; return; }
    if (routerConfigureTimerRef.current) clearTimeout(routerConfigureTimerRef.current);
    routerConfigureTimerRef.current = setTimeout(() => {
      const config = buildCodexRouterConfig({ accounts: codexAccounts, pools: codexPools, usageCache: codexUsageCache, modelCache: codexModelCache, appliedAccountId: activeCodexId, decodeCredential: deobfuscate });
      invoke<CodexRouterStatus>("configure_codex_router", { config }).then((s) => setRouterStatus(s)).catch((e) => console.warn("Failed to refresh Codex router snapshot", e));
    }, 150); return () => { if (routerConfigureTimerRef.current) clearTimeout(routerConfigureTimerRef.current); };
  }, [poolRoutingEnabled, codexAccounts, codexPools, codexUsageCache, codexModelCache, activeCodexId]);

  useEffect(() => {
    if (!poolRoutingEnabled) return;
    let cancelled = false;
    const pollRouterStatus = async () => {
      try {
        const status = await invoke<CodexRouterStatus>("get_codex_router_status"); if (cancelled) return; setRouterStatus(status);
        if (status && (status as any).routedRequestCount > lastSeenRouterRequestCountRef.current) { if ((status as any).lastRoutedAccountId) recordRoutedCodexUse((status as any).lastRoutedAccountId); lastSeenRouterRequestCountRef.current = (status as any).routedRequestCount; }
      } catch (error) { if (!cancelled) console.warn("Failed to poll Codex router status", error); }
    };
    void pollRouterStatus(); const timer = setInterval(pollRouterStatus, 2000); return () => { cancelled = true; clearInterval(timer); };
  }, [poolRoutingEnabled]);

  useEffect(() => {
    let active = true, unlistenStatus: (() => void) | null = null, unlistenWindow: (() => void) | null = null, unlistenWorker: (() => void) | null = null, unlistenRefreshUsage: (() => void) | null = null;
    const setupListeners = async () => {
      const uStatus = await listen<FullStatus | null>("status-updated", (event) => {
        setLastFullStatus(event.payload); updateLocalSessionFromStatus(event.payload as any);
        const accounts = loadCodexAccounts();
        Promise.all(accounts.map((acc) => fetchAccountUsage(acc))).then(async () => { await maybeAutoFailoverActiveCodexPool(); }).catch(console.error);
        if (Date.now() - lastRefreshTimeRef.current >= Math.max(5000, pollIntervalRef.current * 1000)) { lastRefreshTimeRef.current = Date.now(); refreshAntigravityAccountsCloudFirst(loadAntigravityAccounts(), true).catch(console.error); }
      });
      if (!active) uStatus(); else unlistenStatus = uStatus;
      const uWindow = await listen<boolean>("window-shown", () => { invoke<FullStatus | null>("get_quota_status").then((s) => { if (s?.monitoredCodex) setActiveTab("codex"); else setActiveTab("antigravity"); }).catch(console.error); });
      if (!active) uWindow(); else unlistenWindow = uWindow;
      const uWorker = await listen<AntigravityWorkerProgress>("antigravity-worker-progress", (event) => {
        const p = event.payload, isFinal = ["exact", "cached", "cloud_fallback", "error"].includes(p.phase);
        setAntigravityUsageCache((prev) => ({ ...prev, [p.accountId]: { ...prev[p.accountId], loading: !isFinal, exactState: p.phase, workerMessage: p.message } }));
      });
      if (!active) uWorker(); else unlistenWorker = uWorker;
      const uRefreshUsage = await listen("request-refresh-usage", (event: any) => { refreshTrackedAccountOnly(event?.payload); }); if (!active) uRefreshUsage(); else unlistenRefreshUsage = uRefreshUsage;
      const uOverlayVis = await listen<boolean>("overlay-visibility-changed", () => {}); if (!active) uOverlayVis();
    };
    setupListeners(); return () => { active = false; unlistenStatus?.(); unlistenWindow?.(); unlistenWorker?.(); unlistenRefreshUsage?.(); };
  }, []);
  useEffect(() => { publishOverlayUpdate(); }, [publishOverlayUpdate]); useEffect(() => { if (overlayEnabled) invoke("set_overlay_visible", { visible: true }).catch(() => {}); }, []);
  const handleExportBackup = async () => { setPassMode("export"); setPassOpen(true); }; const handleImportBackup = async (content: string) => { try { await invoke("show_dashboard"); } catch {} setPendingBackup(content); setPassMode("import"); setPassOpen(true); };
  const handlePassphraseSubmit = async (passphrase: string) => {
    if (passMode === "export") {
      try {
        const data = { ...buildBackupData(antigravityAccounts, codexAccounts, isDarkMode ? "dark" : "light"), codex: { pools: loadCodexPools() } }, enc = await encryptBackup(data, passphrase), path = await invoke<string>("export_backup_file", { content: enc });
        setPassOpen(false); setExportSuccessPath(path);
      } catch (e: any) { showToast(`Failed to export backup: ${e?.message || e}`, "error"); }
    } else if (pendingBackup) {
      try {
        const pData: any = await decryptBackup(pendingBackup, passphrase);
        if (Array.isArray(pData.pools)) { reconcileCodexPools(normalizeCodexPools(pData.pools), codexAccounts); }
        showToast("Backup imported successfully", "info"); setPassOpen(false);
      } catch { showToast("Invalid passphrase or corrupted backup", "error"); }
    }
  };

  const handleCheckUpdate = async (latestTag = "v1.0.1") => { setUpdateAvailable(true); setUpdateTag(latestTag); /* manual download */ await openUrl(OFFICIAL_RELEASE_URL); };
  const handleSwitchBestAntigravity = async () => { const b = pickBestAntigravityAccount(antigravityAccounts, antigravityUsageCache); if (b && b.account.id !== activeAntigravityId) await handleApplyAntigravityAccount(b.account); }; const handleSwitchBestCodex = async () => { const b = pickBestCodexAccount(codexAccounts, codexUsageCache); if (b && b.account.id !== activeCodexId) await handleApplyCodexAccount(b.account); };

  const handleTrackCurrentAntigravityAccount = async () => {
    setTrackingCurrentProvider("antigravity");
    try {
      const session = await invoke("read_antigravity_session"), candidate = extractAntigravitySessionAccount(session);
      if (!candidate) { showToast("No active Antigravity session found in system", "warning"); return; }
      const match = findAntigravityAccountMatch(antigravityAccounts, candidate), account: AntigravityAccount = match || { ...candidate, id: `ag-${Date.now()}` };
      if (!match) { const updated = upsertAccountById(antigravityAccounts, account); saveAntigravityAccounts(updated); setAntigravityAccounts(updated); saveAccountOrder(ANTIGRAVITY_ORDER_KEY, updated.map((a) => a.id)); }
      setActiveAntigravityId(account.id); localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, account.id);
      setTrackedAccountId(account.id); setTrackedProvider("antigravity"); localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "antigravity"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, account.id);
      await refreshAntigravityAccountsCloudFirst([account], true); showToast(`Tracking Antigravity account: ${account.email || account.label}`);
    } catch (e: any) { showToast(`Failed to track current Antigravity account: ${e?.message || e}`, "error"); } finally { setTrackingCurrentProvider(null); }
  };
  const handleTrackCurrentCodexAccount = async () => {
    setTrackingCurrentProvider("codex");
    try {
      const auth = await invoke("read_codex_auth"), candidate = parseCodexLocalAuth(auth);
      if (!candidate) { showToast("No active Codex session found in system", "warning"); return; }
      const match = findCodexAccountMatch(codexAccounts, candidate), account: CodexAccount = match || { ...candidate, id: `codex-${Date.now()}` };
      if (!match) { const updated = upsertAccountById(codexAccounts, account); saveCodexAccounts(updated); setCodexAccounts(updated); saveAccountOrder(CODEX_ORDER_KEY, updated.map((a) => a.id)); }
      setActiveCodexId(account.id); localStorage.setItem(CODEX_ACTIVE_ID_KEY, account.id);
      setTrackedAccountId(account.id); setTrackedProvider("codex"); localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, "codex"); localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, account.id);
      try { const u = await fetchAccountUsage(account, true); if (!match && classifyCodexTier(u?.planName ?? account.lastPlan, isCodexAccountOAuth(account, u)) === "FREE") await fetchCodexModelCatalog(account, true); } catch { showToast("Tracking Codex session (cloud usage unavailable)", "info"); }
      await invoke("set_monitored_codex", { info: { id: account.id, email: account.email } }); showToast(`Tracking Codex account: ${account.email || account.label}`);
    } catch (e: any) { showToast(`Failed to track current Codex account: ${e?.message || e}`, "error"); } finally { setTrackingCurrentProvider(null); }
  };

  return (
    <div className="app-container" data-card-mode={cardLayoutMode}>
      <Header updateAvailable={updateAvailable} updateTag={updateTag} isDownloadingUpdate={false} onTriggerUpdate={handleCheckUpdate} pollInterval={pollInterval} onPollIntervalChange={handlePollIntervalChange} isRefreshing={isRefreshing} onRefresh={() => triggerRefresh(true)} onExportBackup={handleExportBackup} onImportBackup={handleImportBackup} isDarkMode={isDarkMode} onToggleTheme={handleToggleTheme} isOnline={isOnline} statusText={statusText} keepAliveActive={keepAliveActive} onToggleKeepAlive={handleToggleKeepAlive} persistentWorkersEnabled={persistentWorkers} onTogglePersistentWorkers={handleTogglePersistentWorkers} codexModelScanProgress={codexModelScanProgress} onRescanAllCodexModels={handleRescanAllCodexModels} overlayEnabled={overlayEnabled} onToggleOverlay={handleToggleOverlay} cardLayoutMode={cardLayoutMode} onCardLayoutModeChange={handleCardLayoutModeChange} searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <div className="tab-bar"><button className={`tab-btn ${activeTab === "antigravity" ? "tab-btn--active" : ""}`} onClick={() => setActiveTab("antigravity")} data-tab="antigravity" data-tooltip="Switch to the Antigravity accounts tab"><img className="tab-brand-icon tab-brand-icon--ag-dark" src="https://antigravity.google/assets/image/brand/antigravity-icon__white.png" alt="Antigravity" /><img className="tab-brand-icon tab-brand-icon--ag-light" src="https://antigravity.google/assets/image/brand/antigravity-icon__one-color.png" alt="Antigravity" />Antigravity</button><button className={`tab-btn ${activeTab === "codex" ? "tab-btn--active" : ""}`} onClick={() => setActiveTab("codex")} data-tab="codex" data-tooltip="Switch to the ChatGPT Codex accounts tab"><svg className="tab-brand-icon tab-brand-icon--codex" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" fillRule="evenodd" clipRule="evenodd" strokeLinejoin="round" strokeMiterlimit="2"><path d="M474.123 209.81c11.525-34.577 7.569-72.423-10.838-103.904-27.696-48.168-83.433-72.94-137.794-61.414a127.14 127.14 0 00-95.475-42.49c-55.564 0-104.936 35.781-122.139 88.593-35.781 7.397-66.574 29.76-84.637 61.414-27.868 48.167-21.503 108.72 15.826 150.007-11.525 34.578-7.569 72.424 10.838 103.733 27.696 48.34 83.433 73.111 137.966 61.585 24.084 27.18 58.833 42.835 95.303 42.663 55.564 0 104.936-35.782 122.139-88.594 35.782-7.397 66.574-29.76 84.465-61.413 28.04-48.168 21.676-108.722-15.654-150.008v-.172zm-39.567-87.218c11.01 19.267 15.139 41.803 11.354 63.65-.688-.516-2.064-1.204-2.924-1.72l-101.152-58.49a16.965 16.965 0 00-16.687 0L206.621 194.5v-50.232l97.883-56.597c45.587-26.32 103.732-10.666 130.052 34.921zm-227.935 104.42l49.888-28.9 49.887 28.9v57.63l-49.887 28.9-49.888-28.9v-57.63zm23.223-191.81c22.364 0 43.867 7.742 61.07 22.02-.688.344-2.064 1.204-3.097 1.72L186.666 117.26c-5.161 2.925-8.258 8.43-8.258 14.45v136.934l-43.523-25.116V130.333c0-52.64 42.491-95.13 95.131-95.302l-.172.172zM52.14 168.697c11.182-19.268 28.557-34.062 49.544-41.803V247.14c0 6.02 3.097 11.354 8.258 14.45l118.354 68.295-43.695 25.288-97.711-56.425c-45.415-26.32-61.07-84.465-34.75-130.052zm26.665 220.71c-11.182-19.095-15.139-41.802-11.354-63.65.688.516 2.064 1.204 2.924 1.72l101.152 58.49a16.965 16.965 0 0016.687 0l118.354-68.467v50.232l-97.883 56.425c-45.587 26.148-103.732 10.665-130.052-34.75h.172zm204.54 87.39c-22.192 0-43.867-7.741-60.898-22.02a62.439 62.439 0 003.097-1.72l101.152-58.317c5.16-2.924 8.429-8.43 8.257-14.45V243.527l43.523 25.116v113.022c0 52.64-42.663 95.303-95.131 95.303v-.172zM461.22 343.303c-11.182 19.267-28.729 34.061-49.544 41.63V264.687c0-6.021-3.097-11.526-8.257-14.45L284.893 181.77l43.523-25.116 97.883 56.424c45.587 26.32 61.07 84.466 34.75 130.053l.172.172z" fill="currentColor" /></svg>ChatGPT Codex</button><button className={`tab-btn ${activeTab === "claude" ? "tab-btn--active" : ""}`} onClick={() => setActiveTab("claude")} data-tab="claude" data-tooltip="Switch to the Claude local session tab"><ClaudeLogo size={12} className="tab-brand-icon" />Claude</button></div>
      {activeTab === "antigravity" ? (
        <AntigravityTab accounts={antigravityAccounts} activeId={activeAntigravityId} appliedId={activeAntigravityId} trackedAccountId={trackedAccountId} trackedProvider={trackedProvider} lastFullStatus={lastFullStatus} localSession={localAntigravitySession} antigravityUsageCache={antigravityUsageCache} onApply={handleApplyAntigravityAccount} onDelete={handleDeleteAntigravityAccount} onRename={(acc, label) => { const list = antigravityAccounts.map((a) => (a.id === acc.id ? { ...a, label } : a)); saveAntigravityAccounts(list); setAntigravityAccounts(list); }} onTrack={handleTrackAntigravityAccount} onTrackCurrentAccount={handleTrackCurrentAntigravityAccount} isTrackingCurrentAccount={trackingCurrentProvider === "antigravity"} onRefreshQuota={(acc) => refreshAntigravityAccountsCloudFirst([acc], true)} onSwitchBest={handleSwitchBestAntigravity} onReorder={(ids) => { saveAccountOrder(ANTIGRAVITY_ORDER_KEY, ids); setAntigravityAccounts((p) => sortByOrder(p, ids)); }} onAddAccountClick={() => setAddAgOpen(true)} onAddLocalSessionToMonitored={handleAddLocalSessionToMonitored} searchQuery={searchQuery} />
      ) : activeTab === "codex" ? (
        <CodexTab accounts={codexAccounts} activeId={activeCodexId} appliedId={activeCodexId} trackedAccountId={trackedAccountId} trackedProvider={trackedProvider} lastFullStatus={lastFullStatus} codexUsageCache={codexUsageCache} pools={codexPools} activePoolId={activeCodexPoolId} onApply={(acc) => handleApplyCodexAccount(acc)} onDelete={handleDeleteCodexAccount} onRename={(acc, label) => { const list = codexAccounts.map((a) => (a.id === acc.id ? { ...a, label } : a)); saveCodexAccounts(list); setCodexAccounts(list); }} onTrack={handleTrackCodexAccount} onTrackCurrentAccount={handleTrackCurrentCodexAccount} isTrackingCurrentAccount={trackingCurrentProvider === "codex"} onSelect={(acc) => { setActiveCodexId(acc.id); localStorage.setItem(CODEX_ACTIVE_ID_KEY, acc.id); }} onRefresh={async (acc) => { setCodexUsageCache((p) => ({ ...p, [acc.id]: { ...p[acc.id], loading: true } })); await fetchAccountUsage(acc, true); }} onSwitchBest={handleSwitchBestCodex} onReorder={(ids) => { saveAccountOrder(CODEX_ORDER_KEY, ids); setCodexAccounts((p) => sortByOrder(p, ids)); }} onAddAccountClick={() => setIsCodexModalOpen(true)} onNewPool={() => { setEditingPool(null); setPoolModalOpen(true); }} onEditPool={(p) => { setEditingPool(p); setPoolModalOpen(true); }} onDeletePool={handleDeleteCodexPool} onApplyPool={handleApplyBestCodexPool} poolRoutingEnabled={poolRoutingEnabled} poolRoutingBusy={poolRoutingBusy} routerStatus={routerStatus} onTogglePoolRouting={handleToggleCodexPoolRouting} codexModelCache={codexModelCache} onRescanModels={async (account) => { await fetchCodexModelCatalog(account, true); }} searchQuery={searchQuery} />
      ) : <ClaudeTab status={claudeMonitorStatus} isTracked={trackedProvider === "claude"} onTrackClaude={handleTrackClaude} />}
      <AddAntigravityAccountModal isOpen={addAgOpen} onClose={() => setAddAgOpen(false)} onAccountAdded={async (id) => { const target = loadAntigravityAccounts().find((a) => a.id === id); if (target) await refreshAntigravityAccountsCloudFirst([target], true); }} loadAccounts={loadAntigravityAccounts} saveAccounts={(accs) => { saveAntigravityAccounts(accs); setAntigravityAccounts(accs); }} setActiveAccountId={(id) => { setActiveAntigravityId(id); localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, id); }} onLocalSessionCaptured={handleLocalAntigravitySessionCaptured} />
      {/* Export / Import Passphrase Modal */}
      {passOpen && <PassphraseModal mode={passMode} onSubmit={handlePassphraseSubmit} onCancel={() => setPassOpen(false)} />}
      {exportSuccessPath && <CustomDialog title="Backup Exported Successfully" message={<span>Backup exported successfully to:<br /><code style={{ wordBreak: "break-all", display: "inline-block", marginTop: "6px", fontSize: "11px", opacity: 0.9 }}>{exportSuccessPath}</code></span>} isConfirm confirmText="Open in Explorer" cancelText="Close" confirmVariant="primary" messageAlign="left" onClose={async (confirmed) => { const target = exportSuccessPath; setExportSuccessPath(null); if (confirmed && target) { try { await invoke("open_path_in_file_manager", { path: target }); } catch (e: any) { showToast(`Failed to open explorer: ${e?.message || e}`, "error"); } } }} />}
      {poolModalOpen && <CodexPoolModal isOpen={poolModalOpen} initialPool={editingPool} accounts={codexAccounts} modelCache={codexModelCache} onRequestModelScan={(acc) => fetchCodexModelCatalog(acc)} onSave={handleSaveCodexPool} onClose={() => setPoolModalOpen(false)} />}
      {isCodexModalOpen && <AddAccountModal isOpen={isCodexModalOpen} onClose={() => setIsCodexModalOpen(false)} onAccountAdded={async (id) => { setActiveCodexId(id); localStorage.setItem(CODEX_ACTIVE_ID_KEY, id); const target = loadCodexAccounts().find((a) => a.id === id); if (target) { const u = await fetchAccountUsage(target, true); if (classifyCodexTier(u?.planName ?? target.lastPlan, isCodexAccountOAuth(target, u)) === "FREE") await fetchCodexModelCatalog(target, true); } }} showAlert={async (m) => showToast(m, "info")} loadAccounts={loadCodexAccounts} saveAccounts={(accs) => { saveCodexAccounts(accs); setCodexAccounts(accs); }} onStartFetching={(id, isOAuth) => { setCodexUsageCache((p) => ({ ...p, [id]: { loading: true, isOAuth } })); }} />}
      {accountPendingDelete && <CustomDialog title="Remove Account" message={`Are you sure you want to remove ${accountPendingDelete.email && accountPendingDelete.name && accountPendingDelete.name !== accountPendingDelete.email ? `"${accountPendingDelete.name}" (${accountPendingDelete.email})` : accountPendingDelete.name ? `"${accountPendingDelete.name}"` : accountPendingDelete.email ? `"${accountPendingDelete.email}"` : "this account"} from QuotaShift?`} isConfirm confirmText="Delete" confirmVariant="danger" messageAlign="left" onClose={(confirmed) => { if (confirmed) { const run = accountPendingDelete.onConfirm; setAccountPendingDelete(null); void run(); } else setAccountPendingDelete(null); }} />}
      {accountPendingApply && <CustomDialog title={accountPendingApply.title} message={accountPendingApply.message} isConfirm confirmText="Apply" confirmVariant="primary" messageAlign="left" onClose={(confirmed) => { if (confirmed) { const run = accountPendingApply.onConfirm; setAccountPendingApply(null); void run(); } else setAccountPendingApply(null); }} />}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}<Tooltip />
    </div>
  );
};
