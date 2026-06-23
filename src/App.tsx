import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { deobfuscate, obfuscate, decodeJwtEmail } from "./utils/auth";
import { AntigravityAccount, CodexAccount, FullStatus, CodexMonitoredInfo } from "./utils/types";

// Component imports
import { Header } from "./components/Header";
import { AntigravityTab } from "./components/AntigravityTab";
import { CodexTab } from "./components/CodexTab";
import { AddAccountModal } from "./components/AddAccountModal";
import { AddAntigravityAccountModal } from "./components/AddAntigravityAccountModal";
import { CustomDialog } from "./components/CustomDialog";
import { Tooltip } from "./components/Tooltip";

const CODEX_ACCOUNTS_KEY = "antigravity-codex-accounts";
const CODEX_ACTIVE_ID_KEY = "antigravity-codex-active-id";
const ANTIGRAVITY_ACCOUNTS_KEY = "antigravity-accounts-list";
const ANTIGRAVITY_ACTIVE_ID_KEY = "antigravity-active-id";
const THEME_KEY = "antigravity-theme";

interface DialogState {
  message: string;
  isConfirm: boolean;
  resolve: (value: boolean) => void;
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"antigravity" | "codex">("antigravity");

  // Accounts state
  const [antigravityAccounts, setAntigravityAccounts] = useState<AntigravityAccount[]>([]);
  const [activeAntigravityId, setActiveAntigravityId] = useState<string | null>(null);

  const [codexAccounts, setCodexAccounts] = useState<CodexAccount[]>([]);
  const [activeCodexId, setActiveCodexId] = useState<string | null>(null);

  // Status and details state
  const [lastFullStatus, setLastFullStatus] = useState<FullStatus | null>(null);
  const [codexUsageCache, setCodexUsageCache] = useState<Record<string, any>>({});
  const [pollInterval, setPollInterval] = useState(30);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [statusText, setStatusText] = useState("Connecting...");
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Modals and dialogs state
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [isCodexModalOpen, setIsCodexModalOpen] = useState(false);
  const [isAntigravityModalOpen, setIsAntigravityModalOpen] = useState(false);

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

  // Sync ref values inline during rendering to keep handlers current
  lastFullStatusRef.current = lastFullStatus;
  activeAntigravityIdRef.current = activeAntigravityId;
  activeCodexIdRef.current = activeCodexId;

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
      return raw ? JSON.parse(raw) : [];
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
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveCodexAccounts = (list: CodexAccount[]) => {
    setCodexAccounts(list);
    localStorage.setItem(CODEX_ACCOUNTS_KEY, JSON.stringify(list));
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

    const cxAccounts = loadCodexAccounts();
    setCodexAccounts(cxAccounts);
    const cxActive = localStorage.getItem(CODEX_ACTIVE_ID_KEY);
    setActiveCodexId(cxActive);

    // 3. Initial quota status load
    invoke<FullStatus | null>("get_quota_status")
      .then((status) => {
        if (status) {
          updateUI(status);
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

    checkForUpdates();
  }, []);

  // Update checking
  const checkForUpdates = async () => {
    try {
      const currentVersion = await invoke<string>("is_debug").then((debug) =>
        debug ? "0.0.1" : "1.0.0"
      ); // fallback mockup since we might not have app version API readily built
      const res = await fetch("https://api.github.com/repos/the-long-ride/antigravity-quota-quickcheck/releases/latest");
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
  };

  // Poll Interval Changed
  const handlePollIntervalChange = async (val: number) => {
    setPollInterval(val);
    await invoke("set_poll_interval", { seconds: BigInt(val) });
  };

  // Main UI update parsing (for Antigravity accounts list)
  const updateUI = (status: FullStatus | null) => {
    setLastFullStatus(status);
    if (!status) {
      setIsOnline(false);
      setStatusText("Offline");
      return;
    }

    setIsOnline(true);
    setStatusText("Online");

    // Quota Mirroring Bug Fix: Match incoming update by email or fallback to active Antigravity account ID
    setAntigravityAccounts((prev) => {
      let matchedIdx = -1;
      if (status.email) {
        matchedIdx = prev.findIndex((a) => a.email === status.email);
      }
      if (matchedIdx === -1 && activeAntigravityIdRef.current) {
        matchedIdx = prev.findIndex((a) => a.id === activeAntigravityIdRef.current);
      }

      if (matchedIdx !== -1) {
        const updatedList = [...prev];
        const matched = { ...updatedList[matchedIdx] };
        matched.lastPlan = status.planTier || "Gemini AI";
        matched.lastBalance = status.credits
          ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(status.credits.balance)
          : "—";
        matched.quotas = status.quotas;
        if (status.email) {
          matched.email = status.email;
        }
        updatedList[matchedIdx] = matched;

        localStorage.setItem(ANTIGRAVITY_ACCOUNTS_KEY, JSON.stringify(updatedList));

        // Auto-align active ID if email matched a different card (user switched sessions directly in IDE)
        if (status.email && matched.id !== activeAntigravityIdRef.current) {
          setActiveAntigravityId(matched.id);
          localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, matched.id);
        }

        return updatedList;
      }
      return prev;
    });
  };

  // Refresh Trigger
  const triggerRefresh = async () => {
    lastRefreshTimeRef.current = Date.now();
    setIsRefreshing(true);
    try {
      const status = await invoke<FullStatus | null>("force_refresh");
      updateUI(status);

      // Silently refresh all Codex accounts
      const accounts = loadCodexAccounts();
      accounts.forEach((acc) => {
        setCodexUsageCache((prev) => ({
          ...prev,
          [acc.id]: {
            ...prev[acc.id],
            loading: true,
            isOAuth: deobfuscate(acc.apiKey).startsWith("{"),
          },
        }));
        fetchAccountUsage(acc);
      });
    } catch (err) {
      console.error("Refresh error:", err);
      updateUI(null);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 400);
    }
  };

  // Setup Tauri Listeners
  useEffect(() => {
    let active = true;
    let unlistenStatus: (() => void) | null = null;
    let unlistenWindow: (() => void) | null = null;

    const setupListeners = async () => {
      const uStatus = await listen<FullStatus | null>("status-updated", (event) => {
        updateUI(event.payload);
        // Refresh Codex accounts
        const accounts = loadCodexAccounts();
        accounts.forEach((acc) => {
          fetchAccountUsage(acc);
        });
      });
      if (!active) {
        uStatus();
      } else {
        unlistenStatus = uStatus;
      }

      const uWindow = await listen<boolean>("window-shown", () => {
        // Auto-switch tabs based on monitored account platform
        invoke<FullStatus | null>("get_quota_status").then((status) => {
          if (status?.monitoredCodex) {
            setActiveTab("codex");
          } else {
            setActiveTab("antigravity");
          }
        }).catch(console.error);
      });
      if (!active) {
        uWindow();
      } else {
        unlistenWindow = uWindow;
      }
    };

    setupListeners();

    return () => {
      active = false;
      if (unlistenStatus) unlistenStatus();
      if (unlistenWindow) unlistenWindow();
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

  const fetchAccountUsage = async (account: CodexAccount, isRetry = false) => {
    try {
      const rawKey = deobfuscate(account.apiKey);
      if (rawKey.startsWith("{")) {
        const oauthData = JSON.parse(rawKey);
        const usageData = await invoke<any>("fetch_chatgpt_usage", {
          accessToken: oauthData.accessToken,
          accountId: oauthData.accountId,
        });

        const limits = usageData.rate_limit || {};
        const primary = limits.primary_window;
        const secondary = limits.secondary_window;
        const monthly = limits.monthly_window || limits.month_window;

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

        setCodexUsageCache((prev) => ({
          ...prev,
          [account.id]: {
            loading: false,
            isOAuth: true,
            planName,
            resetsText: resetsStr,
            primary,
            secondary,
            monthly,
            rate_limit: limits,
          },
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
      } else {
        const snapshot = await fetchCodexUsageData(rawKey);
        const totalSpend = snapshot.models.reduce((sum, m) => sum + m.costUsd, 0);
        const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
        const spendStr = `Spend: ${formatter.format(totalSpend)}`;

        setCodexUsageCache((prev) => ({
          ...prev,
          [account.id]: {
            loading: false,
            isOAuth: false,
            planName: snapshot.planName,
            resetsText: spendStr,
            snapshot,
          },
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

              fetchAccountUsage(account, true);
              return;
            } catch (refErr: any) {
              errMsg = "Session expired: " + (refErr?.message ?? String(refErr));
            }
          }
        }
      }

      setCodexUsageCache((prev) => ({
        ...prev,
        [account.id]: {
          loading: false,
          error: errMsg,
        },
      }));
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

      // 1. Quit Antigravity IDE
      await invoke("quit_antigravity_ide");

      setStatusText("Writing session database...");

      // 2. Write token, profileUrl AND refresh_token
      const rawToken = deobfuscate(acc.token);
      const rawProfileUrl = acc.profileUrl ? deobfuscate(acc.profileUrl) : null;
      const rawRefreshToken = acc.refreshToken ? deobfuscate(acc.refreshToken) : null;
      await invoke("write_antigravity_session", {
        token: rawToken,
        refreshToken: rawRefreshToken,
        profileUrl: rawProfileUrl,
      });

      setStatusText("Opening Antigravity IDE...");

      // 3. Reopen Antigravity IDE
      await invoke("open_antigravity_ide");

      // 4. Update states
      setActiveAntigravityId(acc.id);
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

    const list = loadAntigravityAccounts().filter((a) => a.id !== acc.id);
    saveAntigravityAccounts(list);

    if (list.length > 0) {
      if (activeAntigravityId === acc.id) {
        setActiveAntigravityId(list[0].id);
        localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, list[0].id);
        await handleApplyAntigravityAccount(list[0]);
      }
    } else {
      setActiveAntigravityId(null);
      localStorage.removeItem(ANTIGRAVITY_ACTIVE_ID_KEY);
      await invoke("delete_antigravity_session");
      triggerRefresh();
    }
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
      invoke<FullStatus | null>("get_quota_status").then((s) => {
        if (s) updateUI(s);
      }).catch(console.error);
    } catch (err) {
      console.error("Failed to set Antigravity account as tracked:", err);
    }
  };

  // Codex action functions
  const handleApplyCodexAccount = async (acc: CodexAccount) => {
    setActiveCodexId(acc.id);
    localStorage.setItem(CODEX_ACTIVE_ID_KEY, acc.id);

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
    saveCodexAccounts(list);

    if (list.length > 0) {
      if (activeCodexId === acc.id) {
        setActiveCodexId(list[0].id);
        localStorage.setItem(CODEX_ACTIVE_ID_KEY, list[0].id);
        await handleApplyCodexAccount(list[0]);
      }
    } else {
      setActiveCodexId(null);
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
    const cache = codexUsageCache[acc.id];
    if (cache) {
      await updateMonitoredCodexTray(acc, cache);
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
      version: 1,
      exportedAt: new Date().toISOString(),
      platforms,
    };

    return JSON.stringify(backupObj, null, 2);
  };

  const handleExportBackup = async () => {
    const backupJson = generateBackupData();
    try {
      const filePath = await invoke<string>("export_backup_file", { content: backupJson });
      await showAlert(`Backup exported successfully!\nSaved to: ${filePath}`);
      try {
        await openUrl(`file:///${filePath.replace(/\\/g, "/")}`);
      } catch (_) {}
    } catch (err: any) {
      await showAlert(`Failed to export backup: ${err?.message ?? String(err)}`);
    }
  };

  const handleImportBackup = async (content: string) => {
    try {
      const data = JSON.parse(content);
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
    } catch (err: any) {
      await showAlert(`Failed to import data: ${err?.message ?? String(err)}`);
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
        onRefresh={triggerRefresh}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        isOnline={isOnline}
        statusText={statusText}
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
          data-tooltip="Switch to the Codex accounts tab"
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
          Codex
        </button>
      </div>

      {/* Panels */}
      {activeTab === "antigravity" ? (
        <AntigravityTab
          accounts={antigravityAccounts}
          activeId={activeAntigravityId}
          lastFullStatus={lastFullStatus}
          onApply={handleApplyAntigravityAccount}
          onDelete={handleDeleteAntigravityAccount}
          onRename={handleRenameAntigravityAccount}
          onTrack={handleTrackAntigravityAccount}
          onAddAccountClick={() => setIsAntigravityModalOpen(true)}
        />
      ) : (
        <CodexTab
          accounts={codexAccounts}
          activeId={activeCodexId}
          lastFullStatus={lastFullStatus}
          codexUsageCache={codexUsageCache}
          onApply={handleApplyCodexAccount}
          onDelete={handleDeleteCodexAccount}
          onRename={handleRenameCodexAccount}
          onTrack={handleTrackCodexAccount}
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
            href="https://github.com/the-long-ride/antigravity-quota-quickcheck"
            onClick={(e) => {
              e.preventDefault();
              openUrl("https://github.com/the-long-ride/antigravity-quota-quickcheck");
            }}
            className="footer-link"
          >
            GitHub
          </a>
          <span className="footer-link-sep">·</span>
          <a
            href="https://github.com/the-long-ride/antigravity-quota-quickcheck/issues/new"
            onClick={(e) => {
              e.preventDefault();
              openUrl("https://github.com/the-long-ride/antigravity-quota-quickcheck/issues/new");
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
        setActiveAccountId={(id) => {
          setActiveCodexId(id);
          localStorage.setItem(CODEX_ACTIVE_ID_KEY, id);
        }}
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
            await handleApplyAntigravityAccount(target);
          }
        }}
        loadAccounts={loadAntigravityAccounts}
        saveAccounts={saveAntigravityAccounts}
        setActiveAccountId={(id) => {
          setActiveAntigravityId(id);
          localStorage.setItem(ANTIGRAVITY_ACTIVE_ID_KEY, id);
        }}
      />

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
