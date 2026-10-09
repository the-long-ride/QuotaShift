import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit, emitTo } from "@tauri-apps/api/event";
import {
  APP_THEME_EVENT,
  THEME_KEY,
  KEEP_ALIVE_KEY,
  loadKeepAlivePreference,
} from "../../utils/common/app-constants";
import {
  DISPLAY_MODE_EVENT,
  currentPlatform,
  effectiveDisplayMode,
  loadDisplayMode,
  nextQuickToggleMode,
  saveDisplayMode,
  type DisplayMode,
} from "../../utils/common/display-mode";
import { TRACKED_IDS_CHANGED_EVENT, loadTrackedList } from "../../utils/common/tracked-accounts";

/**
 * `onNoTrackedAccounts` fires when the user asks to show the Overlay or Taskbar while no account
 * is tracked: there is nothing to display, so the request is refused and explained instead.
 */
export const useAppThemeAndOverlay = (onNoTrackedAccounts?: () => void) => {
  const [isDarkMode, setIsDarkMode] = useState(
    () => (localStorage.getItem(THEME_KEY) || "dark") === "dark",
  );
  const [keepAliveActive, setKeepAliveActive] = useState(() => loadKeepAlivePreference());
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    const hasTracked = loadTrackedList().length > 0;
    return effectiveDisplayMode(loadDisplayMode(), currentPlatform(), hasTracked);
  });
  const displayModeRef = useRef(displayMode);
  displayModeRef.current = displayMode;
  const onNoTrackedAccountsRef = useRef(onNoTrackedAccounts);
  onNoTrackedAccountsRef.current = onNoTrackedAccounts;
  const overlayEnabled = displayMode !== "none";
  const [isOnline, setIsOnline] = useState(true);
  const [statusText, setStatusText] = useState("Ready");

  const publishAppTheme = (theme: string) => {
    void Promise.allSettled([
      emitTo("overlay", APP_THEME_EVENT, theme),
      emitTo("overlay-tooltip", APP_THEME_EVENT, theme),
      emitTo("taskbar", APP_THEME_EVENT, theme),
    ]);
  };

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    publishAppTheme(saved);
  }, []);

  useEffect(() => {
    let unlistenTheme: (() => void) | undefined;
    listen<string>(APP_THEME_EVENT, (event) => {
      const nextTheme = event.payload === "light" ? "light" : "dark";
      setIsDarkMode(nextTheme === "dark");
      document.documentElement.setAttribute("data-theme", nextTheme);
      localStorage.setItem(THEME_KEY, nextTheme);
    })
      .then((u) => {
        unlistenTheme = u;
      })
      .catch(() => {});
    return () => {
      unlistenTheme?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    // The overlay context menu "Hide" emits false: treat it as switching the display off.
    listen<boolean>("overlay-visibility-changed", (event) => {
      if (event.payload === false && displayModeRef.current !== "none") {
        setDisplayMode("none");
        saveDisplayMode("none");
      }
    })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, []);

  const handleToggleTheme = () => {
    const next = !isDarkMode;
    const nextTheme = next ? "dark" : "light";
    setIsDarkMode(next);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);
    publishAppTheme(nextTheme);
  };

  const handleToggleKeepAlive = async () => {
    const next = !keepAliveActive;
    setKeepAliveActive(next);
    localStorage.setItem(KEEP_ALIVE_KEY, next ? "true" : "false");
    try {
      if (next) await invoke("start_keep_alive");
      else await invoke("stop_keep_alive");
    } catch (e) {
      console.error("Keep-alive toggle error:", e);
    }
  };

  useEffect(() => {
    invoke("set_display_mode", { mode: displayModeRef.current }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleTrackedChanged = () => {
      const hasTracked = loadTrackedList().length > 0;
      if (!hasTracked && displayModeRef.current !== "none") {
        setDisplayMode("none");
        saveDisplayMode("none");
        void emit(DISPLAY_MODE_EVENT, "none").catch(() => {});
        void invoke("set_display_mode", { mode: "none" }).catch(() => {});
      }
    };
    window.addEventListener(TRACKED_IDS_CHANGED_EVENT, handleTrackedChanged);
    window.addEventListener("storage", handleTrackedChanged);
    return () => {
      window.removeEventListener(TRACKED_IDS_CHANGED_EVENT, handleTrackedChanged);
      window.removeEventListener("storage", handleTrackedChanged);
    };
  }, []);

  const handleDisplayModeChange = async (requested: DisplayMode) => {
    const hasTracked = loadTrackedList().length > 0;
    if (!hasTracked && requested !== "none") onNoTrackedAccountsRef.current?.();
    const target = hasTracked ? requested : "none";
    const next = effectiveDisplayMode(target, currentPlatform(), hasTracked);
    setDisplayMode(next);
    saveDisplayMode(next);
    try {
      await emit(DISPLAY_MODE_EVENT, next);
      await invoke("set_display_mode", { mode: next });
    } catch (e) {
      console.warn("Display mode change failed:", e);
    }
  };

  const handleToggleOverlay = () => {
    const hasTracked = loadTrackedList().length > 0;
    if (!hasTracked && displayModeRef.current === "none") {
      onNoTrackedAccountsRef.current?.();
      return Promise.resolve();
    }
    return handleDisplayModeChange(
      nextQuickToggleMode(displayModeRef.current, currentPlatform(), hasTracked),
    );
  };

  return {
    isDarkMode,
    handleToggleTheme,
    keepAliveActive,
    handleToggleKeepAlive,
    overlayEnabled,
    displayMode,
    handleDisplayModeChange,
    handleToggleOverlay,
    isOnline,
    setIsOnline,
    statusText,
    setStatusText,
  };
};
