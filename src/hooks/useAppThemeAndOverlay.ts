import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { THEME_KEY, KEEP_ALIVE_KEY, OVERLAY_ENABLED_KEY } from "../utils/common/app-constants";

export const useAppThemeAndOverlay = () => {
  const [isDarkMode, setIsDarkMode] = useState(() => (localStorage.getItem(THEME_KEY) || "dark") === "dark");
  const [keepAliveActive, setKeepAliveActive] = useState(() => localStorage.getItem(KEEP_ALIVE_KEY) !== "false");
  const [overlayEnabled, setOverlayEnabled] = useState(() => localStorage.getItem(OVERLAY_ENABLED_KEY) !== "false");
  const [isOnline, setIsOnline] = useState(true);
  const [statusText, setStatusText] = useState("Ready");

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) || "dark";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const handleToggleTheme = () => {
    const next = !isDarkMode;
    const nextTheme = next ? "dark" : "light";
    setIsDarkMode(next);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);
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
    await invoke("set_overlay_visible", { visible: next });
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
