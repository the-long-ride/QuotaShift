import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { deobfuscate, obfuscate, decodeJwtEmail, fetchGoogleUserInfo } from "./utils/auth";
import { AntigravityAccount, AntigravityAccountUsage, AntigravityUsageCacheEntry, AntigravityWorkerProgress, CodexAccount, ExactAntigravityAccountRequest, ExactAntigravityAccountResult, FullStatus, CodexMonitoredInfo, LocalAntigravitySession } from "./utils/types";
import { encrypt, decrypt, EncryptedBundle } from "./utils/crypto";
import {
  isUsageCacheFresh,
  pickBestCodexAccount,
  pickBestAntigravityAccount,
} from "./utils/account-selection";
import {
  canAddLocalSessionToMonitored,
  loadLocalAntigravitySession,
  mergeLocalAntigravityStatus,
  saveLocalAntigravitySession,
} from "./utils/local-antigravity-session";
import {
  buildExactRequest,
  loadPersistentWorkerPreference,
  markCloudFallback,
  mergeExactResult,
  savePersistentWorkerPreference,
} from "./utils/antigravity-exact";
import {
  loadAccountOrder,
  saveAccountOrder,
  sortByOrder,
} from "./utils/account-order";

// Component imports
import { Header } from "./components/Header";
import { AntigravityTab } from "./components/AntigravityTab";
import { CodexTab } from "./components/CodexTab";
import { AddAccountModal } from "./components/AddAccountModal";
import { AddAntigravityAccountModal } from "./components/AddAntigravityAccountModal";
import { CustomDialog } from "./components/CustomDialog";
import { Tooltip } from "./components/Tooltip";
import { PassphraseModal } from "./components/PassphraseModal";

const CODEX_ACCOUNTS_KEY = "antigravity-codex-accounts";
const CODEX_ACTIVE_ID_KEY = "antigravity-codex-active-id";
const CODEX_ORDER_KEY = "antigravity-codex-account-order";
const ANTIGRAVITY_ACCOUNTS_KEY = "antigravity-accounts-list";
const ANTIGRAVITY_ACTIVE_ID_KEY = "antigravity-active-id";
const ANTIGRAVITY_ORDER_KEY = "antigravity-account-order";
const THEME_KEY = "antigravity-theme";

export const resolveAntigravityPlanName = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower === "free-tier" || lower === "free") return "Free";
  if (lower === "standard-tier" || lower === "standard") return "Paid";
  if (lower === "legacy-tier" || lower === "legacy") return "Legacy";
  if (
    lower === "advanced-tier" ||
    lower === "advanced" ||
    lower === "google_ai_pro" ||
    lower === "google-ai-pro" ||
    lower === "ai-pro"
  )
    return "Google AI Pro";
  if (
    lower === "ultra-tier" ||
    lower === "ultra" ||
    lower === "google_ai_ultra" ||
    lower === "google-ai-ultra" ||
    lower === "ai-ultra"
  )
    return "Google AI Ultra";
  if (raw.startsWith("GCP Project Quota")) return null;
  if (raw.includes(" ")) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

interface DialogState {
  message: string;
  isConfirm: boolean;
  resolve: (value: boolean) => void;
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"antigravity" | "codex">("antigravity");

  // Accounts state
  const [antigravityAccounts, setAntigravityAccounts] = useState<AntigravityAccount[]>([]);
  const [localAntigravitySession, setLocalAntigravitySession] = useState<LocalAntigravitySession>(() => loadLocalAntigravitySession());
  const [activeAntigravityId, setActiveAntigravityId] = useState<string | null>(null);

  const [codexAccounts, setCodexAccounts] = useState<CodexAccount[]>([]);
  const [activeCodexId, setActiveCodexId] = useState<string | null>(null);
  const [appliedAntigravityId, setAppliedAntigravityId] = useState<string | null>(null);
  const [appliedCodexId, setAppliedCodexId] = useState<string | null>(null);

  // Status and details state
  const [lastFullStatus, setLastFullStatus] = useState<FullStatus | null>(null);
  const [codexUsageCache, setCodexUsageCache] = useState<Record<string, any>>({});
  const [antigravityUsageCache, setAntigravityUsageCache] = useState<Record<string, AntigravityUsageCacheEntry>>({});
  const [pollInterval, setPollInterval] = useState(30);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [keepAliveActive, setKeepAliveActive] = useState(true);
  const [persistentWorkersEnabled, setPersistentWorkersEnabled] = useState(() => loadPersistentWorkerPreference());
  const [statusText, setStatusText] = useState("Connecting...");
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Modals and dialogs state
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [isCodexModalOpen, setIsCodexModalOpen] = useState(false);
  const [isAntigravityModalOpen, setIsAntigravityModalOpen] = useState(false);

  // Export/Import Passphrase Modal State
  const [passphraseModalMode, setPassphraseModalMode] = useState<"export" | "import" | null>(null);
  const [passphraseError, setPassphraseError] = useState("");
  const [pendingBackupContent, setPendingBackupContent] = useState<string | null>(null);

  // Updates state
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateTag, setUpdateTag] = useState("");
  const [updateDownloadUrl, setUpdateDownloadUrl] = useState("");
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);

  const codexTrayLatchRef = useRef(false);

  const lastFullStatusRef = useRef<FullStatus | null>(null);
  const activeAntigravityIdRef = useRef<string | null>(null);
  const activeCodexIdRef = useRef<string | null>(null);
  const lastRefreshTimeRef = useRef<number>(0);
  const codexUsageCacheRef = useRef<Record<string, any>>({});
  const antigravityUsageCacheRef = useRef<Record<string, AntigravityUsageCacheEntry>>({});
  const persistentWorkersEnabledRef = useRef(persistentWorkersEnabled);
  const pollIntervalRef = useRef(pollInterval);
  // Tracks which account was last APPLIED (written to IDE session).
  // Separate from activeAntigravityId (the tracked/monitored card).
  // Used so updateUI only stamps language-server data on the right account.
  const lastAppliedAntigravityIdRef = useRef<string | null>(null);

  // Sync ref values inline during rendering to keep handlers current
  lastFullStatusRef.current = lastFullStatus;
  activeAntigravityIdRef.current = activeAntigravityId;
  activeCodexIdRef.current = activeCodexId;
  codexUsageCacheRef.current = codexUsageCache;
  antigravityUsageCacheRef.current = antigravityUsageCache;
  persistentWorkersEnabledRef.current = persistentWorkersEnabled;
  pollIntervalRef.current = pollInterval;

  // Promisified dialog helper functions
  const showAlert = (message: string): Promise<void> => {
    return new Promise((resolve) => {
      setDialog({
        message,
        isConfirm: false,
        resolve: () => {
          setDialog(null);
          resolve();
        },
      });
    });
  };

  const showConfirm = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({
        message,
        isConfirm: true,
        resolve: (val) => {
          setDialog(null);
          resolve(val);
        },
      });
    });
  };

  // Helper to load accounts lists
  const loadAntigravityAccounts = (): AntigravityAccount[] => {
    try {
      const raw = localStorage.getItem(ANTIGRAVITY_ACCOUNTS_KEY);
      const list = raw ? (JSON.parse(raw) as AntigravityAccount[]) : [];
      return sortByOrder(list, loadAccountOrder(ANTIGRAVITY_ORDER_KEY));
    } catch {
      return [];
    }
  };

  const saveAntigravityAccounts = (list: AntigravityAccount[]) => {
    setAntigravityAccounts(list);
    localStorage.setItem(ANTIGRAVITY_ACCOUNTS_KEY, JSON.stringify(list));
  };

  const loadCodexAccounts = (): CodexAccount[] => {
    try {
      const raw = localStorage.getItem(CODEX_ACCOUNTS_KEY);
      const list = raw ? (JSON.parse(raw) as CodexAccount[]) : [];
      return sortByOrder(list, loadAccountOrder(CODEX_ORDER_KEY));
    } catch {
      return [];
    }
  };

  const saveCodexAccounts = (list: CodexAccount[]) => {
    setCodexAccounts(list);
    localStorage.setItem(CODEX_ACCOUNTS_KEY, JSON.stringify(list));
  };

  const handleReorderAntigravityAccounts = (orderedIds: string[]) => {
    saveAccountOrder(ANTIGRAVITY_ORDER_KEY, orderedIds);
    setAntigravityAccounts((prev) => sortByOrder(prev, orderedIds));
  };

  const handleReorderCodexAccounts = (orderedIds: string[]) => {
    saveAccountOrder(CODEX_ORDER_KEY, orderedIds);
    setCodexAccounts((prev) => sortByOrder(prev, orderedIds));
  };

  const syncActiveCodexAccount = async () => {
    try {
      const authContent = await invoke<string | null>("read_codex_auth");
      if (!authContent) {
        setActiveCodexId(null);
        setAppliedCodexId(null);
        localStorage.removeItem(CODEX_ACTIVE_ID_KEY);
        return;
      }

      let parsedAuth: any = null;
      try {
        parsedAuth = JSON.parse(authContent);
      } catch (e) {
        console.error("Failed to parse Codex auth file:", e);
        return;
      }

      const accounts = loadCodexAccounts();
      let matchedId: string | null = null;

      if (parsedAuth.auth_mode === "openai_api_key" && parsedAuth.OPENAI_API_KEY) {
        const match = accounts.find((acc) => {
          try {
            const rawKey = deobfuscate(acc.apiKey);
            return rawKey === parsedAuth.OPENAI_API_KEY;
          } catch {
            return false;
          }
        });
        if (match) matchedId = match.id;
      } else if (parsedAuth.auth_mode === "chatgpt" && parsedAuth.tokens?.account_id) {
        const targetAccountId = parsedAuth.tokens.account_id;
        const match = accounts.find((acc) => {
          try {
            const rawKey = deobfuscate(acc.apiKey);
            if (rawKey.startsWith("{")) {
              const oauthData = JSON.parse(rawKey);
              return oauthData.accountId === targetAccountId;
            }
          } catch {}
          return false;
        });
        if (match) matchedId = match.id;
      }

      if (matchedId) {
        setActiveCodexId(matchedId);
        setAppliedCodexId(matchedId);
        localStorage.setItem(CODEX_ACTIVE_ID_KEY, matchedId);
      } else {
        setActiveCodexId(null);
        setAppliedCodexId(null);
        localStorage.removeItem(CODEX_ACTIVE_ID_KEY);
      }
    } catch (e) {
      console.error("Failed to sync active Codex account:", e);
    }
  };

  // Initialize theme, configuration, accounts
  useEffect(() => {
    // 1. Theme initialization
    const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
    setIsDarkMode(savedTheme === "dark");
    if (savedTheme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    // 2. Accounts initialization
    const agAccounts = loadAntigravityAccounts();
    setAntigravityAccounts(agAccounts);
    const agActive = localStorage.getItem(ANTIGRAVITY_ACTIVE_ID_KEY);
    setActiveAntigravityId(agActive);
    setAppliedAntigravityId(agActive);
    lastAppliedAntigravityIdRef.current = agActive;

    const cxAccounts = loadCodexAccounts();
    setCodexAccounts(cxAccounts);
    const cxActive = localStorage.getItem(CODEX_ACTIVE_ID_KEY);
    setActiveCodexId(cxActive);
    setAppliedCodexId(cxActive);

    // 3. Initial quota status load
    syncActiveCodexAccount();
    invoke<FullStatus | null>("get_quota_status")
      .then((status) => {
        if (status) {
          updateUI(status);
          if (status.monitoredCodex) {
            setActiveTab("codex");
            const accId = status.monitoredCodex.accountId;
            setTimeout(() => {
              const el = document.getElementById(`codex-account-${accId}`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            }, 250);
          } else {
            setActiveTab("antigravity");
            const accId = localStorage.getItem(ANTIGRAVITY_ACTIVE_ID_KEY);
            if (accId) {
              setTimeout(() => {
                const el = document.getElementById(`ag-account-${accId}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
              }, 250);
            }
          }
        }
      })
      .catch(console.error);

    // 4. Eagerly fetch live usage for all existing Codex accounts so the UI
    //    shows current data on startup instead of waiting for the first
    //    backend `status-updated` event.
    cxAccounts.forEach((acc) => {
      setCodexUsageCache((prev) => ({
        ...prev,
        [acc.id]: { ...prev[acc.id], loading: true, isOAuth: deobfuscate(acc.apiKey).startsWith("{") },
      }));
      fetchAccountUsage(acc);
    });

    // 5. Eagerly fetch direct cloud quota for all Antigravity accounts
    agAccounts.forEach((acc) => {
      setAntigravityUsageCache((prev) => ({ ...prev, [acc.id]: { loading: true } }));
      // Use setTimeout so state is fully initialized before fetching
      setTimeout(() => fetchAntigravityAccountQuota(acc), 0);
    });

    checkForUpdates();

    invoke<any>("get_keep_alive_status")
      .then((status) => {
        if (status?.running !== undefined) {
          setKeepAliveActive(status.running);
        }
      })
      .catch(console.warn);
  }, []);

  // Update checking
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

      if (isNewerVersion(currentClean, latestClean)) {
        const assets = releaseData.assets || [];
        let downloadUrl = "";
        const isWindows = navigator.userAgent.toLowerCase().includes("windows");
        const isLinux = navigator.userAgent.toLowerCase().includes("linux");
        if (isWindows) {
          const asset = assets.find((a: any) => a.name.endsWith(".exe") && !a.name.includes("portable"));
          if (asset) downloadUrl = asset.browser_download_url;
        } else if (isLinux) {
          const asset = assets.find((a: any) => a.name.endsWith(".deb"));
          if (asset) downloadUrl = asset.browser_download_url;
        }
        if (downloadUrl) {
          setUpdateAvailable(true);
          setUpdateTag(latestTag);
          setUpdateDownloadUrl(downloadUrl);
        }
      }
    } catch (err) {
      console.error("Check for updates failed:", err);
    }
  };

  const isNewerVersion = (current: string, latest: string): boolean => {
    const cParts = current.split(".").map(Number);
    const lParts = latest.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      const cPart = cParts[i] || 0;
      const lPart = lParts[i] || 0;
      if (lPart > cPart) return true;
      if (lPart < cPart) return false;
    }
    return false;
  };

  const handleTriggerUpdate = async () => {
    const confirmUpdate = await showConfirm(
      `A new version (${updateTag}) of QuotaShift is available. Do you want to download and install it now?`
    );
    if (confirmUpdate) {
      setIsDownloadingUpdate(true);
      invoke("execute_update", { url: updateDownloadUrl }).catch(async (err) => {
        setIsDownloadingUpdate(false);
        await showAlert(`Update failed: ${err}`);
      });
    }
  };

  // Theme Toggler
  const handleToggleTheme = () => {
    const nextTheme = isDarkMode ? "light" : "dark";
    setIsDarkMode(!isDarkMode);
    localStorage.setItem(THEME_KEY, nextTheme);
    if (nextTheme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  const handleToggleKeepAlive = async () => {
    const next = !keepAliveActive;
    setKeepAliveActive(next);
    localStorage.setItem("keepAliveActive", next ? "true" : "false");
    try {
      if (next) {
        await invoke("start_keep_alive", { intervalMins: 240 });
      } else {
        await invoke("stop_keep_alive");
      }
    } catch (e) { console.warn("keep-alive toggle failed:", e); }
  };

  const handleTogglePersistentWorkers = async () => {
    const next = !persistentWorkersEnabled;
    if (next) {
      const confirmed = await showConfirm(
        "Persistent exact Antigravity monitoring is experimental. It keeps one isolated background Antigravity profile per monitored account, uses additional RAM/CPU, may briefly flash windows, and may break after Antigravity updates. QuotaShift will only terminate processes it can prove it owns. Enable at your own risk?",
      );
      if (!confirmed) return;
    }
    setPersistentWorkersEnabled(next);
    persistentWorkersEnabledRef.current = next;
    savePersistentWorkerPreference(next);
    if (!next) {
      try {
        await invoke("stop_all_antigravity_workers");
      } catch (error) {
        console.warn("Failed to stop persistent Antigravity workers", error);
      }
    }
  };

  // Poll Interval Changed
  const handlePollIntervalChange = async (val: number) => {
    setPollInterval(val);
    await invoke("set_poll_interval", { seconds: BigInt(val) });
  };

  // Main UI update parsing. The user's real Antigravity profile is always
  // represented by the protected local-session card, never by a monitored card.
  const updateUI = (status: FullStatus | null) => {
    setLastFullStatus(status);
    setLocalAntigravitySession((previous) => {
      const next = mergeLocalAntigravityStatus(previous, status);
      saveLocalAntigravitySession(next);
      return next;
    });

    if (!status || status.online === false) {
      setIsOnline(false);
      setStatusText("Offline");
      return;
    }

    setIsOnline(true);
    setStatusText("Online");

    if (!status.email) return;
    const normalizedEmail = status.email.trim().toLowerCase();
    const matched = loadAntigravityAccounts().find(
      (account) => account.email?.trim().toLowerCase() === normalizedEmail,
    );
    if (matched) {
      setAppliedAntigravityId(matched.id);
      lastAppliedAntigravityIdRef.current = matched.id;
    } else {
      setAppliedAntigravityId(null);
      lastAppliedAntigravityIdRef.current = null;
    }
  };

  const handleLocalAntigravitySessionCaptured = (captured: AntigravityAccount) => {
    setLocalAntigravitySession((previous) => {
      const next: LocalAntigravitySession = {
        ...previous,
        email: captured.email ?? previous.email,
        online: previous.online,
        capturedAccount: {
          token: captured.token,
          refreshToken: captured.refreshToken,
          profileUrl: captured.profileUrl,
          email: captured.email,
          authMethod: captured.authMethod,
        },
      };
      saveLocalAntigravitySession(next);
      return next;
    });
  };

  const handleAddLocalSessionToMonitored = () => {
    const accounts = loadAntigravityAccounts();
    if (!canAddLocalSessionToMonitored(localAntigravitySession, accounts)) return;
    const captured = localAntigravitySession.capturedAccount;
    if (!captured?.token) return;
    const email = (localAntigravitySession.email || captured.email || "").trim();
    const label = email ? email.split("@")[0] : "Local Antigravity";
    const newAccount: AntigravityAccount = {
      id: `ag-acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      token: captured.token,
      refreshToken: captured.refreshToken,
      profileUrl: captured.profileUrl,
      email: email || undefined,
      authMethod: captured.authMethod,
      lastPlan: resolveAntigravityPlanName(localAntigravitySession.planTier) || undefined,
      lastBalance: localAntigravitySession.credits
        ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(localAntigravitySession.credits.balance)
        : undefined,
      quotas: localAntigravitySession.quotas,
    };
    const updated = [...accounts, newAccount];
    saveAntigravityAccounts(updated);
    saveAccountOrder(ANTIGRAVITY_ORDER_KEY, updated.map((account) => account.id));
  };

  const applyExactResultToAccount = (result: ExactAntigravityAccountResult) => {
    if (result.state !== "exact" || !result.status) return;
    const status = result.status;
    setAntigravityAccounts((previous) => {
      const updated = previous.map((account) =>
        account.id === result.accountId
          ? {
              ...account,
              email: status.email || account.email,
              lastPlan: resolveAntigravityPlanName(status.planTier) || account.lastPlan,
              lastBalance: status.credits
                ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(status.credits.balance)
                : account.lastBalance,
              quotas: status.quotas,
              lastQuotaFetchedAt: Date.now(),
            }
          : account,
      );
      localStorage.setItem(ANTIGRAVITY_ACCOUNTS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const refreshExactAntigravityAccounts = async (
    accounts: AntigravityAccount[],
    allowCloudFallback = true,
  ): Promise<void> => {
    if (accounts.length === 0) return;
    const validRequests = accounts
      .map((account) => ({ account, request: buildExactRequest(account, deobfuscate) }))
      .filter(
        (entry): entry is { account: AntigravityAccount; request: ExactAntigravityAccountRequest } =>
          entry.request !== null,
      );
    const invalidAccounts = accounts.filter(
      (account) => !validRequests.some((entry) => entry.account.id === account.id),
    );

    setAntigravityUsageCache((previous) => {
      const next = { ...previous };
      for (const account of accounts) {
        next[account.id] = {
          ...next[account.id],
          loading: true,
          exactState: "preparing_profile",
          workerMessage: "Preparing exact quota refresh",
          error: undefined,
        };
      }
      return next;
    });

    for (const account of invalidAccounts) {
      const result: ExactAntigravityAccountResult = {
        accountId: account.id,
        state: "error",
        status: null,
        error: "Exact quota requires a captured account email and access token",
        fetchedAt: new Date().toISOString(),
      };
      setAntigravityUsageCache((previous) => ({
        ...previous,
        [account.id]: mergeExactResult(previous[account.id], result),
      }));
      if (allowCloudFallback) await fetchAntigravityAccountQuota(account, true, true);
    }

    if (validRequests.length === 0) return;
    let results: ExactAntigravityAccountResult[];
    try {
      results = await invoke<ExactAntigravityAccountResult[]>("refresh_antigravity_accounts_exact", {
        requests: validRequests.map((entry) => entry.request),
        persistent: persistentWorkersEnabledRef.current,
      });
    } catch (error: any) {
      results = validRequests.map(({ account }) => ({
        accountId: account.id,
        state: "error",
        status: null,
        error: error?.message ?? String(error),
        fetchedAt: new Date().toISOString(),
      }));
    }

    for (const result of results) {
      setAntigravityUsageCache((previous) => ({
        ...previous,
        [result.accountId]: mergeExactResult(previous[result.accountId], result),
      }));
      applyExactResultToAccount(result);
      if (result.state !== "exact" && allowCloudFallback) {
        const account = accounts.find((candidate) => candidate.id === result.accountId);
        if (account) await fetchAntigravityAccountQuota(account, true, true);
      }
    }
  };

  // Refresh Trigger
  const triggerRefresh = async (force = false) => {
    lastRefreshTimeRef.current = Date.now();
    setIsRefreshing(true);
    try {
      await syncActiveCodexAccount();
      const status = await invoke<FullStatus | null>("force_refresh");
      updateUI(status);

      const codexAccountsToRefresh = loadCodexAccounts().filter(
        (account) => force || !isUsageCacheFresh(codexUsageCacheRef.current[account.id]),
      );
      await Promise.all(
        codexAccountsToRefresh.map(async (account) => {
          setCodexUsageCache((previous) => ({
            ...previous,
            [account.id]: {
              ...previous[account.id],
              loading: true,
              isOAuth: deobfuscate(account.apiKey).startsWith("{"),
            },
          }));
          await fetchAccountUsage(account, force);
        }),
      );

      const exactAccounts = loadAntigravityAccounts().filter(
        (account) => force || !isUsageCacheFresh(antigravityUsageCacheRef.current[account.id]),
      );
      await refreshExactAntigravityAccounts(exactAccounts, true);
    } catch (err) {
      console.error("Refresh error:", err);
      updateUI(null);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Cloud Code is fallback data. It updates cloud model details but never
  // replaces a previously verified exact five-hour/weekly snapshot.
  const fetchAntigravityAccountQuota = async (
    acc: AntigravityAccount,
    force = false,
    asFallback = false,
  ): Promise<AntigravityUsageCacheEntry> => {
    if (!force && isUsageCacheFresh(antigravityUsageCacheRef.current[acc.id])) {
      return antigravityUsageCacheRef.current[acc.id];
    }

    try {
      const rawToken = deobfuscate(acc.token);
      const rawRefreshToken = acc.refreshToken ? deobfuscate(acc.refreshToken) : undefined;
      const usageResult = await invoke<AntigravityAccountUsage>("fetch_antigravity_account_usage", {
        accessToken: rawToken,
        refreshToken: rawRefreshToken ?? null,
        authMethod: acc.authMethod ?? null,
      });

      let activeToken = rawToken;
      let newAccessToken: string | undefined;
      let newRefreshToken: string | undefined;
      if (usageResult.refreshedTokens) {
        newAccessToken = usageResult.refreshedTokens.accessToken;
        newRefreshToken = usageResult.refreshedTokens.refreshToken;
        if (newAccessToken) activeToken = newAccessToken;
      }

      let email = acc.email;
      let fetchedProfileUrl: string | undefined;
      if (!email || !acc.profileUrl) {
        try {
          const userInfo = await fetchGoogleUserInfo(activeToken);
          if (userInfo?.email) email = userInfo.email;
          if (userInfo?.picture) fetchedProfileUrl = userInfo.picture;
        } catch (error) {
          console.warn("Google UserInfo was unavailable for Antigravity fallback", error);
        }
      }

      setAntigravityAccounts((previous) => {
        const updated = previous.map((account) =>
          account.id === acc.id
            ? {
                ...account,
                token: newAccessToken ? obfuscate(newAccessToken) : account.token,
                refreshToken: newRefreshToken ? obfuscate(newRefreshToken) : account.refreshToken,
                authMethod: usageResult.refreshedTokens?.authMethod || account.authMethod,
                cloudQuotas: usageResult.quotas?.length ? usageResult.quotas : account.cloudQuotas,
                lastPlan: resolveAntigravityPlanName(usageResult.planTier) || account.lastPlan || "Gemini AI",
                email: email || account.email,
                profileUrl: fetchedProfileUrl ? obfuscate(fetchedProfileUrl) : account.profileUrl,
                lastQuotaFetchedAt: Date.now(),
              }
            : account,
        );
        localStorage.setItem(ANTIGRAVITY_ACCOUNTS_KEY, JSON.stringify(updated));
        return updated;
      });

      const cloudEntry: AntigravityUsageCacheEntry = {
        loading: false,
        cloudQuotas: usageResult.quotas,
        planTier: usageResult.planTier,
        email: email ?? null,
        fetchedAt: Date.now(),
        source: "cloud",
      };
      const prior = antigravityUsageCacheRef.current[acc.id];
      const returnedEntry: AntigravityUsageCacheEntry = asFallback
        ? markCloudFallback(prior, cloudEntry)
        : {
            ...prior,
            ...cloudEntry,
            source: prior?.source === "exact" || prior?.source === "cached_exact" ? prior.source : "cloud",
          };
      antigravityUsageCacheRef.current = {
        ...antigravityUsageCacheRef.current,
        [acc.id]: returnedEntry,
      };
      setAntigravityUsageCache((previous) => ({ ...previous, [acc.id]: returnedEntry }));
      return returnedEntry;
    } catch (err: any) {
      const failedEntry: AntigravityUsageCacheEntry = {
        loading: false,
        error: err?.message ?? String(err),
      };
      const prior = antigravityUsageCacheRef.current[acc.id];
      const returnedEntry: AntigravityUsageCacheEntry = asFallback
        ? markCloudFallback(prior, failedEntry)
        : { ...prior, ...failedEntry };
      antigravityUsageCacheRef.current = {
        ...antigravityUsageCacheRef.current,
        [acc.id]: returnedEntry,
      };
      setAntigravityUsageCache((previous) => ({ ...previous, [acc.id]: returnedEntry }));
      return returnedEntry;
    }
  };

  // Setup Tauri Listeners
  useEffect(() => {
    let active = true;
    let unlistenStatus: (() => void) | null = null;
    let unlistenWindow: (() => void) | null = null;
    let unlistenWorker: (() => void) | null = null;

    const setupListeners = async () => {
      const uStatus = await listen<FullStatus | null>("status-updated", (event) => {
        updateUI(event.payload);
        // Refresh Codex accounts
        const accounts = loadCodexAccounts();
        accounts.forEach((acc) => {
          fetchAccountUsage(acc);
        });
        const agAccounts = loadAntigravityAccounts();
        if (persistentWorkersEnabledRef.current) {
          const minimumGap = Math.max(5000, pollIntervalRef.current * 1000);
          if (Date.now() - lastRefreshTimeRef.current >= minimumGap) {
            lastRefreshTimeRef.current = Date.now();
            refreshExactAntigravityAccounts(agAccounts, true).catch(console.error);
          }
        } else {
          agAccounts.forEach((account) => fetchAntigravityAccountQuota(account));
        }
      });
      if (!active) {
        uStatus();
      } else {
        unlistenStatus = uStatus;
      }

      const uWindow = await listen<boolean>("window-shown", () => {
        syncActiveCodexAccount();
        // Auto-switch tabs based on monitored account platform
        invoke<FullStatus | null>("get_quota_status").then((status) => {
          if (status?.monitoredCodex) {
            setActiveTab("codex");
            const accId = status.monitoredCodex.accountId;
            setTimeout(() => {
              const el = document.getElementById(`codex-account-${accId}`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            }, 150);
          } else {
            setActiveTab("antigravity");
            const accId = localStorage.getItem(ANTIGRAVITY_ACTIVE_ID_KEY);
            if (accId) {
              setTimeout(() => {
                const el = document.getElementById(`ag-account-${accId}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
              }, 150);
            }
          }
        }).catch(console.error);
      });
      if (!active) {
        uWindow();
      } else {
        unlistenWindow = uWindow;
      }

      const uWorker = await listen<AntigravityWorkerProgress>("antigravity-worker-progress", (event) => {
        const progress = event.payload;
        const isFinal = ["exact", "cached", "cloud_fallback", "error"].includes(progress.phase);
        setAntigravityUsageCache((previous) => ({
          ...previous,
          [progress.accountId]: {
            ...previous[progress.accountId],
            loading: !isFinal,
            exactState: progress.phase,
            workerMessage: progress.message,
          },
        }));
      });
      if (!active) {
        uWorker();
      } else {
        unlistenWorker = uWorker;
      }
    };

    setupListeners();

    return () => {
      active = false;
      if (unlistenStatus) unlistenStatus();
      if (unlistenWindow) unlistenWindow();
      if (unlistenWorker) unlistenWorker();
    };
  }, []);

  // Codex fetch usage logic
  const fetchCodexUsageData = async (apiKey: string) => {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    const subRes = await fetch("https://api.openai.com/v1/dashboard/billing/subscription", { headers });
    if (!subRes.ok) {
      if (subRes.status === 401) throw new Error("Invalid API key. Please check your key and try again.");
      throw new Error(`Subscription API error: ${subRes.status} ${subRes.statusText}`);
    }
    const sub = await subRes.json();

    const hardLimit = (sub.hard_limit_usd ?? sub.hard_limit ?? 0) as number;
    const softLimit = (sub.soft_limit_usd ?? sub.soft_limit ?? 0) as number;
    const planName = (sub.plan?.title ?? sub.plan?.id ?? "Pay-as-you-go") as string;
    const creditBalance = (sub.system_hard_limit_usd ?? hardLimit) as number;

    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(
      tomorrow.getDate()
    ).padStart(2, "0")}`;

    const usageRes = await fetch(
      `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
      { headers }
    );

    const models: any[] = [];
    if (usageRes.ok) {
      const usageData = await usageRes.json();
      const byModel: Record<string, { tokens: number; cost: number }> = {};
      const dailyCosts = (usageData.daily_costs ?? []) as any[];
      for (const day of dailyCosts) {
        const lineItems = (day.line_items ?? []) as any[];
        for (const item of lineItems) {
          const modelName = (item.name ?? "unknown") as string;
          const cost = (item.cost ?? 0) as number;
          if (!byModel[modelName]) byModel[modelName] = { tokens: 0, cost: 0 };
          byModel[modelName].cost += cost;
        }
      }
      for (const [modelName, data] of Object.entries(byModel)) {
        if (data.cost > 0) {
          models.push({
            model: modelName,
            totalTokens: data.tokens,
            costUsd: data.cost / 100,
          });
        }
      }
      models.sort((a, b) => b.costUsd - a.costUsd);
    }

    return {
      planName,
      creditBalance,
      hardLimit,
      softLimit,
      models,
      periodStart: startDate,
      periodEnd: endDate,
    };
  };

  const fetchAccountUsage = async (account: CodexAccount, force = false, isRetry = false): Promise<any> => {
    if (!force && isUsageCacheFresh(codexUsageCacheRef.current[account.id])) return codexUsageCacheRef.current[account.id];

    try {
      const rawKey = deobfuscate(account.apiKey);
      if (rawKey.startsWith("{")) {
        const oauthData = JSON.parse(rawKey);
        const usageData = await invoke<any>("fetch_chatgpt_usage", {
          accessToken: oauthData.accessToken,
          accountId: oauthData.accountId,
        });

        let planName = "ChatGPT Free";
        const planType = usageData.plan_type || "free";
        if (planType === "pro") planName = "ChatGPT Pro";
        else if (planType === "plus") planName = "ChatGPT Plus";
        else if (planType === "team") planName = "ChatGPT Team";
        else if (planType === "enterprise") planName = "ChatGPT Enterprise";
        else if (planType === "education" || planType === "edu") planName = "ChatGPT Edu";
        else {
          planName = "ChatGPT " + planType.charAt(0).toUpperCase() + planType.slice(1);
        }

        const limits = usageData.rate_limit || {};
        const primary = limits.primary_window;
        const isPlusOrAbove = planType !== "free";
        const rawMonthly = limits.monthly_window || limits.month_window;
        const secondary = limits.secondary_window || limits.weekly_window || (isPlusOrAbove ? rawMonthly : null);
        const monthly = isPlusOrAbove ? null : rawMonthly;

        let resetsRemaining: any = null;
        const possibleKeys = [
          "resets_remaining",
          "resets_left",
          "resets",
          "reset_times_remaining",
          "reset_remaining",
          "resets_bank",
          "reset_bank",
        ];
        for (const windowObj of [primary, monthly, secondary]) {
          if (windowObj) {
            for (const key of possibleKeys) {
              if (windowObj[key] !== undefined && windowObj[key] !== null) {
                resetsRemaining = windowObj[key];
                break;
              }
            }
          }
          if (resetsRemaining !== null) break;
        }
        const resetsStr = resetsRemaining !== null ? `${resetsRemaining} resets remaining` : "0 resets remaining";

        const oauthEntry = {
          loading: false,
          fetchedAt: Date.now(),
          isOAuth: true,
          planName,
          resetsText: resetsStr,
          primary,
          secondary,
          monthly,
          rate_limit: limits,
        };
        setCodexUsageCache((prev) => ({
          ...prev,
          [account.id]: oauthEntry,
        }));

        const emailFromToken = decodeJwtEmail(oauthData.idToken);
        let emailChanged = false;
        if (emailFromToken && account.email !== emailFromToken) {
          account.email = emailFromToken;
          emailChanged = true;
        }

        if (account.lastPlan !== planName || account.lastResets !== resetsStr || emailChanged) {
          account.lastPlan = planName;
          account.lastResets = resetsStr;
          setCodexAccounts((prevAccounts) => {
            const updated = prevAccounts.map((a) => (a.id === account.id ? { ...account } : a));
            localStorage.setItem(CODEX_ACCOUNTS_KEY, JSON.stringify(updated));
            return updated;
          });
        }

        const currentMonitoredId = lastFullStatusRef.current?.monitoredCodex?.accountId ?? null;
        if (currentMonitoredId === account.id || (!currentMonitoredId && !codexTrayLatchRef.current)) {
          codexTrayLatchRef.current = true;
          updateMonitoredCodexTray(account, {
            loading: false,
            isOAuth: true,
            planName,
            resetsText: resetsStr,
            primary,
            secondary,
            monthly,
          });
        }

        return oauthEntry;
      } else {
        const snapshot = await fetchCodexUsageData(rawKey);
        const totalSpend = snapshot.models.reduce((sum, m) => sum + m.costUsd, 0);
        const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
        const spendStr = `Spend: ${formatter.format(totalSpend)}`;

        const snapshotEntry = {
          loading: false,
          fetchedAt: Date.now(),
          isOAuth: false,
          planName: snapshot.planName,
          resetsText: spendStr,
          snapshot,
        };
        setCodexUsageCache((prev) => ({
          ...prev,
          [account.id]: snapshotEntry,
        }));

        if (account.lastPlan !== snapshot.planName || account.lastResets !== spendStr) {
          account.lastPlan = snapshot.planName;
          account.lastResets = spendStr;
          setCodexAccounts((prevAccounts) => {
            const updated = prevAccounts.map((a) => (a.id === account.id ? { ...account } : a));
            localStorage.setItem(CODEX_ACCOUNTS_KEY, JSON.stringify(updated));
            return updated;
          });
        }

        const currentMonitoredId = lastFullStatusRef.current?.monitoredCodex?.accountId ?? null;
        if (currentMonitoredId === account.id || (!currentMonitoredId && !codexTrayLatchRef.current)) {
          codexTrayLatchRef.current = true;
          const limit = snapshot.hardLimit || snapshot.softLimit || 120;
          const primaryPercent = limit > 0 ? Math.round((totalSpend / limit) * 100) : 0;
          const remPercent = Math.max(0, 100 - primaryPercent);

          updateMonitoredCodexTray(account, {
            loading: false,
            isOAuth: false,
            planName: snapshot.planName,
            resetsText: spendStr,
            snapshot,
            primaryPercent: remPercent,
          });
        }

        return snapshotEntry;
      }
    } catch (err: any) {
      let errMsg = err?.message ?? String(err);
      if (
        !isRetry &&
        (errMsg.includes("Token exchange failed") ||
          errMsg.includes("401") ||
          errMsg.includes("Unauthorized") ||
          errMsg.includes("expired"))
      ) {
        const rawKey = deobfuscate(account.apiKey);
        if (rawKey.startsWith("{")) {
          const oauthData = JSON.parse(rawKey);
          if (oauthData.refreshToken) {
            try {
              const tokenJson = await invoke<any>("refresh_chatgpt_token", {
                refreshToken: oauthData.refreshToken,
              });
              oauthData.accessToken = tokenJson.access_token;
              oauthData.refreshToken = tokenJson.refresh_token || oauthData.refreshToken;
              oauthData.idToken = tokenJson.id_token || oauthData.idToken || null;

              account.apiKey = obfuscate(JSON.stringify(oauthData));
              setCodexAccounts((prevAccounts) => {
                const updated = prevAccounts.map((a) => (a.id === account.id ? { ...account } : a));
                localStorage.setItem(CODEX_ACCOUNTS_KEY, JSON.stringify(updated));
                return updated;
              });

              // Sync refreshed token back to ~/.codex/auth.json if this is the active/applied account
              if (account.id === activeCodexIdRef.current) {
                try {
                  const authData = {
                    auth_mode: "chatgpt",
                    tokens: {
                      access_token: oauthData.accessToken,
                      refresh_token: oauthData.refreshToken,
                      account_id: oauthData.accountId,
                      id_token: oauthData.idToken,
                    },
                  };
                  await invoke("write_codex_auth", { content: JSON.stringify(authData, null, 2) });
                  // OAuth maintenance updates provider settings without replacing auth.json.
                  await invoke("sync_codex_provider_config", {
                    baseUrl: "https://api.openai.com/v1",
                    model: null,
                  }).catch((e) => console.warn("config.toml sync skipped:", e));
                } catch (writeErr) {
                  console.error("Failed to write refreshed token to auth.json:", writeErr);
                }
              }

              return await fetchAccountUsage(account, force, true);
            } catch (refErr: any) {
              errMsg = "Session expired: " + (refErr?.message ?? String(refErr));

              // Automatically try to re-read and recover session from ~/.codex/auth.json
              try {
                const rawAuth = await invoke<string | null>("read_codex_auth");
                if (rawAuth) {
                  const authData = JSON.parse(rawAuth);
                  if (authData && authData.auth_mode === "chatgpt" && authData.tokens && authData.tokens.access_token) {
                    const tokens = authData.tokens;
                    const newEmail = decodeJwtEmail(tokens.id_token);
                    if (newEmail && account.email === newEmail) {
                      const newOauthData = {
                        accessToken: tokens.access_token,
                        refreshToken: tokens.refresh_token,
                        accountId: tokens.account_id,
                        idToken: tokens.id_token,
                        isOAuth: true,
                      };
                      account.apiKey = obfuscate(JSON.stringify(newOauthData));
                      setCodexAccounts((prevAccounts) => {
                        const updated = prevAccounts.map((a) => (a.id === account.id ? { ...account } : a));
                        localStorage.setItem(CODEX_ACCOUNTS_KEY, JSON.stringify(updated));
                        return updated;
                      });
                      return await fetchAccountUsage(account, force, true);
                    }
                  }
                }
              } catch (importErr) {
                console.error("Auto re-import from auth.json failed:", importErr);
              }
            }
          }
        }
      }

      const errorEntry = {
        loading: false,
        error: errMsg,
      };
      setCodexUsageCache((prev) => ({
        ...prev,
        [account.id]: errorEntry,
      }));
      return errorEntry;
    }
  };

  const updateMonitoredCodexTray = async (acc: CodexAccount, cache: any) => {
    if (!cache || cache.loading || cache.error) return;
    codexTrayLatchRef.current = true;

    if (cache.isOAuth) {
      const windows = [];
      if (cache.primary) {
        let name = "5h";
        if (
          cache.planName === "ChatGPT Free" ||
          (cache.primary.reset_at && cache.primary.reset_at - Date.now() / 1000 > 24 * 3600)
        ) {
          name = "mo";
        }
        windows.push({ name, window: cache.primary });
      }
      if (cache.secondary) windows.push({ name: "wk", window: cache.secondary });
      if (cache.monthly) windows.push({ name: "mo", window: cache.monthly });

      const info: CodexMonitoredInfo = {
        accountId: acc.id,
        label: acc.label,
        primaryPercent: null,
        primaryLabel: "",
        secondaryPercent: null,
        secondaryLabel: "",
      };

      if (windows.length > 0) {
        const w1 = windows[0];
        const usedPct = Math.min(100, Math.max(0, w1.window.used_percent || 0));
        info.primaryPercent = Math.max(0, 100 - usedPct);
        info.primaryLabel = w1.name;
      }
      if (windows.length > 1) {
        const w2 = windows[1];
        const usedPct = Math.min(100, Math.max(0, w2.window.used_percent || 0));
        info.secondaryPercent = Math.max(0, 100 - usedPct);
        info.secondaryLabel = w2.name;
      }

      try {
        await invoke("set_monitored_codex", { info });
        setLastFullStatus((prev) => (prev ? { ...prev, monitoredCodex: info } : prev));
        // Force background sync
        invoke<FullStatus | null>("get_quota_status").then((s) => {
          if (s) updateUI(s);
        }).catch(console.error);
      } catch (e) {
        console.error("Failed to set monitored codex:", e);
      }
    } else {
      const info: CodexMonitoredInfo = {
        accountId: acc.id,
        label: acc.label,
        primaryPercent: cache.primaryPercent ?? 100,
        primaryLabel: "Spend",
        secondaryPercent: null,
        secondaryLabel: "",
      };

      try {
        await invoke("set_monitored_codex", { info });
        setLastFullStatus((prev) => (prev ? { ...prev, monitoredCodex: info } : prev));
        invoke<FullStatus | null>("get_quota_status").then((s) => {
          if (s) updateUI(s);
        }).catch(console.error);
      } catch (e) {
        console.error("Failed to set monitored codex:", e);
      }
    }
  };

  // Antigravity action functions
  const handleApplyAntigravityAccount = async (acc: AntigravityAccount) => {
    try {
      setStatusText("Switching account...");
      setIsOnline(false);

      // Stop QuotaShift-owned isolated workers first so the existing IDE
      // restart path cannot leave stale persistent-worker state behind.
      try {
        await invoke("stop_all_antigravity_workers");
      } catch (error) {
        console.warn("Could not stop isolated Antigravity workers before applying an account", error);
      }

      // 1. Quit the user's Antigravity IDE because Apply intentionally changes
      // the real local session.
      await invoke("quit_antigravity_ide");

      // 2. Refresh the token so we write a fresh, valid access token
      let freshAccessToken = deobfuscate(acc.token);
      const rawRefreshToken = acc.refreshToken ? deobfuscate(acc.refreshToken) : null;

      if (rawRefreshToken) {
        setStatusText("Refreshing token...");
        try {
          const refreshed = await invoke<any>("refresh_antigravity_token", {
            refreshToken: rawRefreshToken,
            authMethod: acc.authMethod ?? null,
          });
          if (refreshed?.access_token) {
            freshAccessToken = refreshed.access_token;
            // Save refreshed tokens back to the account card
            const newAt = refreshed.access_token;
            const newRt = refreshed.refresh_token;
            const newAuthMethod = refreshed.authMethod;
            setAntigravityAccounts((prev) => {
              const updated = prev.map((a) =>
                a.id === acc.id
                  ? {
                      ...a,
                      token: newAt ? obfuscate(newAt) : a.token,
                      refreshToken: newRt ? obfuscate(newRt) : a.refreshToken,
                      authMethod: newAuthMethod || a.authMethod,
                    }
                  : a
              );
              localStorage.setItem(ANTIGRAVITY_ACCOUNTS_KEY, JSON.stringify(updated));
              return updated;
            });
          }
        } catch (refErr) {
          console.warn("Token refresh before apply failed, using existing token:", refErr);
        }
      }

      setStatusText("Writing session database...");

      // 3. Write the fresh token to session
      const rawProfileUrl = acc.profileUrl ? deobfuscate(acc.profileUrl) : null;
      const currentRefreshToken = acc.refreshToken ? deobfuscate(acc.refreshToken) : null;
      await invoke("write_antigravity_session", {
        token: freshAccessToken,
        refreshToken: currentRefreshToken,
        profileUrl: rawProfileUrl,
        email: acc.email ?? null,
      });

      setStatusText("Opening Antigravity IDE...");

      // 4. Reopen Antigravity IDE
      await invoke("open_antigravity_ide");

      // 5. Update states — mark this account as the IDE session owner
      lastAppliedAntigravityIdRef.current = acc.id;
      setActiveAntigravityId(acc.id);
      setAppliedAntigravityId(acc.id);
      localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, acc.id);

      // Clear monitored Codex account
      await invoke("set_monitored_codex", { info: null });
      setLastFullStatus((prev) => (prev ? { ...prev, monitoredCodex: null } : prev));

      setTimeout(async () => {
        await triggerRefresh();
      }, 1500);
    } catch (err) {
      console.error("Failed to switch Antigravity account:", err);
      await showAlert("Failed to switch account: " + err);
      triggerRefresh();
    }
  };

  const handleDeleteAntigravityAccount = async (acc: AntigravityAccount) => {
    const confirmed = await showConfirm(`Remove Antigravity account "${acc.label}"?`);
    if (!confirmed) return;

    try {
      await invoke("stop_antigravity_worker", { accountId: acc.id });
    } catch (error) {
      console.warn("Could not stop the account's isolated Antigravity worker", error);
    }

    const list = loadAntigravityAccounts().filter((a) => a.id !== acc.id);
    const remainingIds = list.map((a) => a.id);
    saveAntigravityAccounts(list);
    saveAccountOrder(
      ANTIGRAVITY_ORDER_KEY,
      loadAccountOrder(ANTIGRAVITY_ORDER_KEY).filter((id) => remainingIds.includes(id))
    );

    // Clean up usage cache for removed account
    setAntigravityUsageCache((prev) => {
      const next = { ...prev };
      delete next[acc.id];
      return next;
    });

    // If the removed account was active/tracked, switch tracking to first remaining
    if (activeAntigravityId === acc.id) {
      if (list.length > 0) {
        setActiveAntigravityId(list[0].id);
        if (appliedAntigravityId === acc.id) setAppliedAntigravityId(list[0].id);
        localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, list[0].id);
      } else {
        setActiveAntigravityId(null);
        setAppliedAntigravityId(null);
        localStorage.removeItem(ANTIGRAVITY_ACTIVE_ID_KEY);
      }
    }
    if (appliedAntigravityId === acc.id && activeAntigravityId !== acc.id) {
      setAppliedAntigravityId(list.length > 0 ? list[0].id : null);
    }
    // NEVER touch the IDE session — accounts in this app are independent of the running IDE
  };

  const handleRenameAntigravityAccount = (acc: AntigravityAccount, newLabel: string) => {
    const list = loadAntigravityAccounts().map((a) => (a.id === acc.id ? { ...a, label: newLabel } : a));
    saveAntigravityAccounts(list);
  };

  const handleTrackAntigravityAccount = async (acc: AntigravityAccount) => {
    try {
      setActiveAntigravityId(acc.id);
      localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, acc.id);
      await invoke("set_monitored_codex", { info: null });
      setLastFullStatus((prev) => (prev ? { ...prev, monitoredCodex: null } : prev));

      // Fetch this account's live quota directly from the cloud API.
      // Do NOT call get_quota_status here — that reads the language server which
      // represents the currently-logged-in IDE account, not the tracked one.
      const cache = antigravityUsageCache[acc.id];
      if (!cache?.fetchedAt || cache?.error) {
        setAntigravityUsageCache((prev) => ({ ...prev, [acc.id]: { ...prev[acc.id], loading: true } }));
      }
      fetchAntigravityAccountQuota(acc);
    } catch (err) {
      console.error("Failed to set Antigravity account as tracked:", err);
    }
  };

  // Codex action functions
  const handleApplyCodexAccount = async (acc: CodexAccount) => {
    setActiveCodexId(acc.id);
    setAppliedCodexId(acc.id);
    localStorage.setItem(CODEX_ACTIVE_ID_KEY, acc.id);

    try {
      const rawKey = deobfuscate(acc.apiKey);
      const baseUrl = "https://api.openai.com/v1";
      if (rawKey.startsWith("{")) {
        const oauthData = JSON.parse(rawKey);
        const authData = {
          auth_mode: "chatgpt",
          tokens: {
            access_token: oauthData.accessToken,
            refresh_token: oauthData.refreshToken,
            account_id: oauthData.accountId,
            id_token: oauthData.idToken,
          },
        };
        await invoke("write_codex_auth", { content: JSON.stringify(authData, null, 2) });
        await invoke("sync_codex_provider_config", { baseUrl, model: null });
      } else {
        await invoke("sync_codex_config", { apiKey: rawKey, baseUrl, model: null });
      }

      // Clear the current monitored status so the newly applied account takes over the tray monitoring.
      codexTrayLatchRef.current = false;
      await invoke("set_monitored_codex", { info: null });
      setLastFullStatus((prev) => (prev ? { ...prev, monitoredCodex: null } : prev));
    } catch (err) {
      console.error("Failed to write codex auth:", err);
    }

    setCodexUsageCache((prev) => ({
      ...prev,
      [acc.id]: {
        ...prev[acc.id],
        loading: true,
      },
    }));
    await fetchAccountUsage(acc);
  };

  const handleDeleteCodexAccount = async (acc: CodexAccount) => {
    const confirmed = await showConfirm(`Remove account "${acc.label}"?`);
    if (!confirmed) return;

    const list = loadCodexAccounts().filter((a) => a.id !== acc.id);
    const remainingIds = list.map((a) => a.id);
    saveCodexAccounts(list);
    saveAccountOrder(
      CODEX_ORDER_KEY,
      loadAccountOrder(CODEX_ORDER_KEY).filter((id) => remainingIds.includes(id))
    );

    if (list.length > 0) {
      if (activeCodexId === acc.id) {
        setActiveCodexId(list[0].id);
        localStorage.setItem(CODEX_ACTIVE_ID_KEY, list[0].id);
        await handleApplyCodexAccount(list[0]);
      }
    } else {
      setActiveCodexId(null);
      setAppliedCodexId(null);
      localStorage.removeItem(CODEX_ACTIVE_ID_KEY);
      await invoke("set_monitored_codex", { info: null });
      setLastFullStatus((prev) => (prev ? { ...prev, monitoredCodex: null } : prev));
      triggerRefresh();
    }
  };

  const handleRenameCodexAccount = (acc: CodexAccount, newLabel: string) => {
    const list = loadCodexAccounts().map((a) => (a.id === acc.id ? { ...a, label: newLabel } : a));
    saveCodexAccounts(list);
  };

  const handleTrackCodexAccount = async (acc: CodexAccount) => {
    let cache = codexUsageCache[acc.id];
    if (!cache || cache.error) {
      setCodexUsageCache((prev) => ({ ...prev, [acc.id]: { ...prev[acc.id], loading: true } }));
      cache = await fetchAccountUsage(acc, true);
    }
    if (cache && !cache.error) {
      await updateMonitoredCodexTray(acc, cache);
    }
  };

  // Best-account auto-switch (adapted from codex-multi-auth / antigravity-usage forecast)
  const handleSwitchBestCodex = async () => {
    const accounts = loadCodexAccounts();
    if (accounts.length < 2) {
      await showAlert("Add at least two Codex accounts to use best-account switching.");
      return;
    }
    setIsRefreshing(true);
    try {
      const freshCache: Record<string, any> = {};
      for (const acc of accounts) {
        setCodexUsageCache((prev) => ({ ...prev, [acc.id]: { ...prev[acc.id], loading: true } }));
        const entry = await fetchAccountUsage(acc, true);
        freshCache[acc.id] = entry;
      }
      const best = pickBestCodexAccount(accounts, freshCache);
      if (!best) {
        await showAlert("Could not determine the best Codex account. Try refreshing first.");
        return;
      }
      if (best.account.id === activeCodexId) {
        await showAlert(`${best.account.label} is already the best available Codex account.`);
        return;
      }
      const ok = await showConfirm(
        `Switch to best Codex account: ${best.account.label} (${Math.round(best.score)}% remaining)?`
      );
      if (ok) await handleApplyCodexAccount(best.account);
    } catch (e) {
      console.error("Best Codex switch failed:", e);
      await showAlert("Failed to evaluate best Codex account.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSwitchBestAntigravity = async () => {
    const accounts = loadAntigravityAccounts();
    if (accounts.length < 2) {
      await showAlert("Add at least two Antigravity accounts to use best-account switching.");
      return;
    }
    setIsRefreshing(true);
    try {
      const freshCache: Record<string, any> = {};
      for (const acc of accounts) {
        setAntigravityUsageCache((prev) => ({ ...prev, [acc.id]: { ...prev[acc.id], loading: true } }));
        const entry = await fetchAntigravityAccountQuota(acc, true);
        freshCache[acc.id] = entry;
      }
      const best = pickBestAntigravityAccount(accounts, freshCache);
      if (!best) {
        await showAlert("Could not determine the best Antigravity account. Try refreshing first.");
        return;
      }
      if (best.account.id === activeAntigravityId) {
        await showAlert(`${best.account.label} is already the best available Antigravity account.`);
        return;
      }
      const ok = await showConfirm(
        `Switch to best Antigravity account: ${best.account.label} (${Math.round(best.score)}% remaining)?`
      );
      if (ok) await handleApplyAntigravityAccount(best.account);
    } catch (e) {
      console.error("Best Antigravity switch failed:", e);
      await showAlert("Failed to evaluate best Antigravity account.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Backup Import / Export
  const generateBackupData = (): string => {
    const codexList = loadCodexAccounts();
    const antigravityList = loadAntigravityAccounts();

    const platforms: any = {
      codex: {
        accounts: codexList,
        activeId: activeCodexId,
      },
      antigravity: {
        accounts: antigravityList,
        activeId: activeAntigravityId,
      },
    };

    // Find other platforms
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        key.startsWith("antigravity-") &&
        key.endsWith("-accounts") &&
        key !== CODEX_ACCOUNTS_KEY &&
        key !== ANTIGRAVITY_ACCOUNTS_KEY
      ) {
        const platformName = key.substring("antigravity-".length, key.length - "-accounts".length);
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const accounts = JSON.parse(raw);
            const activeId = localStorage.getItem(`antigravity-${platformName}-active-id`);
            platforms[platformName] = {
              accounts,
              activeId,
            };
          }
        } catch {}
      }
    }

    const backupObj = {
      version: 2,
      exportedAt: new Date().toISOString(),
      platforms,
    };

    return JSON.stringify(backupObj, null, 2);
  };

  const performImport = async (data: any) => {
    if (!data || typeof data !== "object" || !data.platforms) {
      await showAlert("Invalid backup file: missing platforms object.");
      return;
    }

    let importedCount = 0;
    let updatedCount = 0;

    for (const [platformKey, platformData] of Object.entries(data.platforms)) {
      const pData = platformData as any;
      if (!pData || !Array.isArray(pData.accounts)) continue;

      if (platformKey === "codex") {
        const currentAccounts = loadCodexAccounts();
        pData.accounts.forEach((impAcc: any) => {
          if (!impAcc.id || !impAcc.apiKey) return;
          const existingIdx = currentAccounts.findIndex(
            (a) => a.email && impAcc.email && a.email === impAcc.email
          );
          if (existingIdx !== -1) {
            currentAccounts[existingIdx] = {
              ...currentAccounts[existingIdx],
              ...impAcc,
              id: currentAccounts[existingIdx].id,
            };
            updatedCount++;
          } else {
            currentAccounts.push(impAcc);
            importedCount++;
          }
        });
        saveCodexAccounts(currentAccounts);
      } else if (platformKey === "antigravity") {
        const currentAccounts = loadAntigravityAccounts();
        pData.accounts.forEach((impAcc: any) => {
          if (!impAcc.id || !impAcc.token) return;
          const existingIdx = currentAccounts.findIndex(
            (a) => a.email && impAcc.email && a.email === impAcc.email
          );
          if (existingIdx !== -1) {
            currentAccounts[existingIdx] = {
              ...currentAccounts[existingIdx],
              ...impAcc,
              id: currentAccounts[existingIdx].id,
            };
            updatedCount++;
          } else {
            currentAccounts.push(impAcc);
            importedCount++;
          }
        });
        saveAntigravityAccounts(currentAccounts);
      } else {
        const storageKey = `antigravity-${platformKey}-accounts`;
        let currentAccounts: any[] = [];
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) currentAccounts = JSON.parse(raw);
        } catch {}

        pData.accounts.forEach((impAcc: any) => {
          if (!impAcc.id) return;
          const existingIdx = currentAccounts.findIndex(
            (a) => a.email && impAcc.email && a.email === impAcc.email
          );
          if (existingIdx !== -1) {
            currentAccounts[existingIdx] = {
              ...currentAccounts[existingIdx],
              ...impAcc,
              id: currentAccounts[existingIdx].id,
            };
            updatedCount++;
          } else {
            currentAccounts.push(impAcc);
            importedCount++;
          }
        });
        localStorage.setItem(storageKey, JSON.stringify(currentAccounts));
      }
    }

    await showAlert(`Imported ${importedCount} new accounts, updated ${updatedCount} existing accounts.`);
    triggerRefresh();
  };

  const handleExportBackup = async () => {
    setPassphraseError("");
    setPassphraseModalMode("export");
  };

  const handleImportBackup = async (content: string) => {
    try {
      const data = JSON.parse(content);

      // Handle encrypted backup files
      if (data && data.encrypted === true && data.salt && data.iv && data.data) {
        setPendingBackupContent(content);
        setPassphraseError("");
        setPassphraseModalMode("import");
        return;
      }

      await performImport(data);
    } catch (err: any) {
      await showAlert(`Failed to import data: ${err?.message ?? String(err)}`);
    }
  };

  const handlePassphraseSubmit = async (passphrase: string) => {
    setPassphraseError("");
    if (passphraseModalMode === "export") {
      const backupJson = generateBackupData();
      try {
        const bundle = await encrypt(backupJson, passphrase);
        const encryptedExport = JSON.stringify({
          version: 2,
          encrypted: true,
          ...bundle,
        }, null, 2);
        const filePath = await invoke<string>("export_backup_file", { content: encryptedExport });
        await showAlert(`Encrypted backup exported successfully!\nSaved to: ${filePath}`);
        setPassphraseModalMode(null);
        try {
          await openUrl(`file:///${filePath.replace(/\\/g, "/")}`);
        } catch (_) {}
      } catch (err: any) {
        setPassphraseError(`Failed to export backup: ${err?.message ?? String(err)}`);
      }
    } else if (passphraseModalMode === "import") {
      if (!pendingBackupContent) return;
      try {
        const data = JSON.parse(pendingBackupContent);
        const bundle: EncryptedBundle = { salt: data.salt, iv: data.iv, data: data.data };
        const decryptedJson = await decrypt(bundle, passphrase);
        const parsedData = JSON.parse(decryptedJson);

        await performImport(parsedData);

        setPassphraseModalMode(null);
        setPendingBackupContent(null);
      } catch (err: any) {
        setPassphraseError("Failed to decrypt backup. Wrong passphrase or corrupted file.");
      }
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <Header
        updateAvailable={updateAvailable}
        updateTag={updateTag}
        isDownloadingUpdate={isDownloadingUpdate}
        onTriggerUpdate={handleTriggerUpdate}
        pollInterval={pollInterval}
        onPollIntervalChange={handlePollIntervalChange}
        isRefreshing={isRefreshing}
        onRefresh={() => triggerRefresh(true)}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        isOnline={isOnline}
        statusText={statusText}
        keepAliveActive={keepAliveActive}
        onToggleKeepAlive={handleToggleKeepAlive}
        persistentWorkersEnabled={persistentWorkersEnabled}
        onTogglePersistentWorkers={handleTogglePersistentWorkers}
      />

      {/* Tab Bar */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === "antigravity" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("antigravity")}
          data-tooltip="Switch to the Antigravity accounts tab"
        >
          <img
            className="tab-brand-icon tab-brand-icon--ag-dark"
            src="https://antigravity.google/assets/image/brand/antigravity-icon__white.png"
            alt="Antigravity"
          />
          <img
            className="tab-brand-icon tab-brand-icon--ag-light"
            src="https://antigravity.google/assets/image/brand/antigravity-icon__one-color.png"
            alt="Antigravity"
          />
          Antigravity
        </button>
        <button
          className={`tab-btn ${activeTab === "codex" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("codex")}
          data-tooltip="Switch to the ChatGPT Codex accounts tab"
        >
          <svg
            className="tab-brand-icon tab-brand-icon--codex"
            viewBox="0 0 512 512"
            xmlns="http://www.w3.org/2000/svg"
            fillRule="evenodd"
            clipRule="evenodd"
            strokeLinejoin="round"
            strokeMiterlimit="2"
          >
            <path
              d="M474.123 209.81c11.525-34.577 7.569-72.423-10.838-103.904-27.696-48.168-83.433-72.94-137.794-61.414a127.14 127.14 0 00-95.475-42.49c-55.564 0-104.936 35.781-122.139 88.593-35.781 7.397-66.574 29.76-84.637 61.414-27.868 48.167-21.503 108.72 15.826 150.007-11.525 34.578-7.569 72.424 10.838 103.733 27.696 48.34 83.433 73.111 137.966 61.585 24.084 27.18 58.833 42.835 95.303 42.663 55.564 0 104.936-35.782 122.139-88.594 35.782-7.397 66.574-29.76 84.465-61.413 28.04-48.168 21.676-108.722-15.654-150.008v-.172zm-39.567-87.218c11.01 19.267 15.139 41.803 11.354 63.65-.688-.516-2.064-1.204-2.924-1.72l-101.152-58.49a16.965 16.965 0 00-16.687 0L206.621 194.5v-50.232l97.883-56.597c45.587-26.32 103.732-10.666 130.052 34.921zm-227.935 104.42l49.888-28.9 49.887 28.9v57.63l-49.887 28.9-49.888-28.9v-57.63zm23.223-191.81c22.364 0 43.867 7.742 61.07 22.02-.688.344-2.064 1.204-3.097 1.72L186.666 117.26c-5.161 2.925-8.258 8.43-8.258 14.45v136.934l-43.523-25.116V130.333c0-52.64 42.491-95.13 95.131-95.302l-.172.172zM52.14 168.697c11.182-19.268 28.557-34.062 49.544-41.803V247.14c0 6.02 3.097 11.354 8.258 14.45l118.354 68.295-43.695 25.288-97.711-56.425c-45.415-26.32-61.07-84.465-34.75-130.052zm26.665 220.71c-11.182-19.095-15.139-41.802-11.354-63.65.688.516 2.064 1.204 2.924 1.72l101.152 58.49a16.965 16.965 0 0016.687 0l118.354-68.467v50.232l-97.883 56.425c-45.587 26.148-103.732 10.665-130.052-34.75h.172zm204.54 87.39c-22.192 0-43.867-7.741-60.898-22.02a62.439 62.439 0 003.097-1.72l101.152-58.317c5.16-2.924 8.429-8.43 8.257-14.45V243.527l43.523 25.116v113.022c0 52.64-42.663 95.303-95.131 95.303v-.172zM461.22 343.303c-11.182 19.267-28.729 34.061-49.544 41.63V264.687c0-6.021-3.097-11.526-8.257-14.45L284.893 181.77l43.523-25.116 97.883 56.424c45.587 26.32 61.07 84.466 34.75 130.053l.172.172z"
              fill="currentColor"
            />
          </svg>
          ChatGPT Codex
        </button>
      </div>

      {/* Panels */}
      {activeTab === "antigravity" ? (
        <AntigravityTab
          accounts={antigravityAccounts}
          activeId={activeAntigravityId}
          appliedId={appliedAntigravityId}
          lastFullStatus={lastFullStatus}
          localSession={localAntigravitySession}
          antigravityUsageCache={antigravityUsageCache}
          onApply={handleApplyAntigravityAccount}
          onDelete={handleDeleteAntigravityAccount}
          onRename={handleRenameAntigravityAccount}
          onTrack={handleTrackAntigravityAccount}
          onRefreshQuota={(acc) => refreshExactAntigravityAccounts([acc], true)}
          onSwitchBest={handleSwitchBestAntigravity}
          onReorder={handleReorderAntigravityAccounts}
          onAddAccountClick={() => setIsAntigravityModalOpen(true)}
          onAddLocalSessionToMonitored={handleAddLocalSessionToMonitored}
        />
      ) : (
        <CodexTab
          accounts={codexAccounts}
          activeId={activeCodexId}
          appliedId={appliedCodexId}
          lastFullStatus={lastFullStatus}
          codexUsageCache={codexUsageCache}
          onApply={handleApplyCodexAccount}
          onDelete={handleDeleteCodexAccount}
          onRename={handleRenameCodexAccount}
          onTrack={handleTrackCodexAccount}
          onSwitchBest={handleSwitchBestCodex}
          onReorder={handleReorderCodexAccounts}
          onAddAccountClick={() => setIsCodexModalOpen(true)}
        />
      )}

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-left">
          {activeTab === "codex" && (
            <div id="footer-left-codex" className="footer-links" style={{ display: "flex" }}>
              <a
                href="https://platform.openai.com/usage"
                onClick={(e) => {
                  e.preventDefault();
                  openUrl("https://platform.openai.com/usage");
                }}
                className="footer-link"
              >
                OpenAI Platform
              </a>
              <span className="footer-link-sep">·</span>
              <a
                href="https://platform.openai.com/account/api-keys"
                onClick={(e) => {
                  e.preventDefault();
                  openUrl("https://platform.openai.com/account/api-keys");
                }}
                className="footer-link"
              >
                API Keys
              </a>
            </div>
          )}
        </div>
        <div className="footer-links">
          <span className="footer-attr">
            made by{" "}
            <a
              href="https://github.com/the-long-ride"
              onClick={(e) => {
                e.preventDefault();
                openUrl("https://github.com/the-long-ride");
              }}
              className="footer-link footer-link--author"
            >
              the-long-ride
            </a>{" "}
            with ❤️
          </span>
          <span className="footer-link-sep">·</span>
          <a
            href="https://github.com/the-long-ride/QuotaShift"
            onClick={(e) => {
              e.preventDefault();
              openUrl("https://github.com/the-long-ride/QuotaShift");
            }}
            className="footer-link"
          >
            GitHub
          </a>
          <span className="footer-link-sep">·</span>
          <a
            href="https://github.com/the-long-ride/QuotaShift/issues/new"
            onClick={(e) => {
              e.preventDefault();
              openUrl("https://github.com/the-long-ride/QuotaShift/issues/new");
            }}
            className="footer-link"
          >
            Report Issue
          </a>
        </div>
      </footer>

      {/* Codex Modal */}
      <AddAccountModal
        isOpen={isCodexModalOpen}
        onClose={() => setIsCodexModalOpen(false)}
        onAccountAdded={async (id) => {
          const accounts = loadCodexAccounts();
          const target = accounts.find((a) => a.id === id);
          if (target) {
            await fetchAccountUsage(target);
          }
        }}
        showAlert={showAlert}
        loadAccounts={loadCodexAccounts}
        saveAccounts={saveCodexAccounts}
        onStartFetching={(id, isOAuth) => {
          setCodexUsageCache((prev) => ({
            ...prev,
            [id]: {
              loading: true,
              isOAuth,
            },
          }));
        }}
      />

      {/* Antigravity Modal */}
      <AddAntigravityAccountModal
        isOpen={isAntigravityModalOpen}
        onClose={() => setIsAntigravityModalOpen(false)}
        onAccountAdded={async (id) => {
          const accounts = loadAntigravityAccounts();
          const target = accounts.find((a) => a.id === id);
          if (target) {
            setAntigravityUsageCache((prev) => ({ ...prev, [id]: { loading: true } }));
            fetchAntigravityAccountQuota(target);
            lastAppliedAntigravityIdRef.current = target.id;
            setActiveAntigravityId(target.id);
            setAppliedAntigravityId(target.id);
            localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, target.id);
          }
        }}
        loadAccounts={loadAntigravityAccounts}
        saveAccounts={saveAntigravityAccounts}
        onLocalSessionCaptured={handleLocalAntigravitySessionCaptured}
        setActiveAccountId={(id) => {
          setActiveAntigravityId(id);
          setAppliedAntigravityId(id);
          lastAppliedAntigravityIdRef.current = id;
          localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, id);
        }}
      />

      {/* Export / Import Passphrase Modal */}
      {passphraseModalMode && (
        <PassphraseModal
          mode={passphraseModalMode}
          onSubmit={handlePassphraseSubmit}
          onCancel={() => {
            setPassphraseModalMode(null);
            setPendingBackupContent(null);
          }}
          error={passphraseError}
        />
      )}

      {/* Dialog Overlay */}
      {dialog && (
        <CustomDialog message={dialog.message} isConfirm={dialog.isConfirm} onClose={(val) => dialog.resolve(val)} />
      )}

      {/* Tooltip system */}
      <Tooltip />
    </div>
  );
};
export default App;
