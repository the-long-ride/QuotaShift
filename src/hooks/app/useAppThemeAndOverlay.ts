import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit, emitTo } from "@tauri-apps/api/event";
import {
  APP_THEME_EVENT,
  THEME_KEY,
  KEEP_ALIVE_KEY,
  OVERLAY_ENABLED_KEY,
  loadKeepAlivePreference,
} from "../../utils/common/app-constants";

export const useAppThemeAndOverlay = () => {
  const [isDarkMode, setIsDarkMode] = useState(
    () => (localStorage.getItem(THEME_KEY) || "dark") === "dark",
  );
  const [keepAliveActive, setKeepAliveActive] = useState(() => loadKeepAlivePreference());
  const [overlayEnabled, setOverlayEnabled] = useState(
    () => localStorage.getItem(OVERLAY_ENABLED_KEY) !== "false",
  );
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
    listen<boolean>("overlay-visibility-changed", (event) => {
      if (typeof event.payload === "boolean") {
        setOverlayEnabled(event.payload);
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

  const handleToggleOverlay = async () => {
    const next = !overlayEnabled;
    setOverlayEnabled(next);
    localStorage.setItem(OVERLAY_ENABLED_KEY, String(next));
    try {
      await emit("overlay-visibility-changed", next);
      await invoke("set_overlay_visible", { visible: next });
    } catch (e) {
      console.warn("Toggle overlay failed:", e);
    }
  };

  return {
    isDarkMode,
    handleToggleTheme,
    keepAliveActive,
    handleToggleKeepAlive,
    overlayEnabled,
    handleToggleOverlay,
    isOnline,
    setIsOnline,
    statusText,
    setStatusText,
  };
};
