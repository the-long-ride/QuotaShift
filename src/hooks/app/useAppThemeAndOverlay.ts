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

export const useAppThemeAndOverlay = () => {
  const [isDarkMode, setIsDarkMode] = useState(
    () => (localStorage.getItem(THEME_KEY) || "dark") === "dark",
  );
  const [keepAliveActive, setKeepAliveActive] = useState(() => loadKeepAlivePreference());
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() =>
    effectiveDisplayMode(loadDisplayMode(), currentPlatform()),
  );
  const displayModeRef = useRef(displayMode);
  displayModeRef.current = displayMode;
  const overlayEnabled = displayMode !== "none";
  const [isOnline, setIsOnline] = useState(true);
  const [statusText, setStatusText] = useState("Ready");

  const publishAppTheme = (theme: string) => {
    void Promise.allSettled([
      emitTo("overlay", APP_THEME_EVENT, theme),
      emitTo("overlay-tooltip", APP_THEME_EVENT, theme),
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

  const handleDisplayModeChange = async (requested: DisplayMode) => {
    const next = effectiveDisplayMode(requested, currentPlatform());
    setDisplayMode(next);
    saveDisplayMode(next);
    try {
      await emit(DISPLAY_MODE_EVENT, next);
      await invoke("set_display_mode", { mode: next });
    } catch (e) {
      console.warn("Display mode change failed:", e);
    }
  };

  const handleToggleOverlay = () =>
    handleDisplayModeChange(nextQuickToggleMode(displayModeRef.current));

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
