import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { OverlayAccountData } from "./OverlayApp";
import { loadUiAdjustmentPreferences } from "../../utils/common/ui-adjustment";
import { dashboardTabForTarget } from "./OverlayCardStack";

export interface UseOverlayContextMenuOptions {
  data: OverlayAccountData;
  setData: React.Dispatch<React.SetStateAction<OverlayAccountData>>;
  clearHover: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}

export function useOverlayContextMenu({
  data,
  setData,
  clearHover,
  menuRef,
}: UseOverlayContextMenuOptions) {
  // Provider tab of the right-clicked card; "Open dashboard" lands on it.
  const menuTabRef = useRef<string | null>(null);
  const [menuState, setMenuState] = useState<{ isOpen: boolean; x: number; y: number }>({
    isOpen: false,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    if (!menuState.isOpen) return;
    const handleOutside = (e: MouseEvent | PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest(".overlay-context-menu"))
        setMenuState((prev) => ({ ...prev, isOpen: false }));
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuState((prev) => ({ ...prev, isOpen: false }));
    };
    window.addEventListener("pointerdown", handleOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handleOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [menuState.isOpen]);

  useLayoutEffect(() => {
    if (!menuState.isOpen || !menuRef.current) return;
    const scale = (loadUiAdjustmentPreferences().overlayScale || 100) / 100;
    const rect = menuRef.current.getBoundingClientRect(),
      winWidth = (window.innerWidth || 340) / scale,
      winHeight = (window.innerHeight || 80) / scale,
      pad = 4 / scale;
    const rectWidth = rect.width / scale;
    const rectHeight = rect.height / scale;
    let adjustedX = menuState.x,
      adjustedY = menuState.y;
    if (adjustedX + rectWidth > winWidth - pad)
      adjustedX = Math.max(pad, winWidth - rectWidth - pad);
    if (adjustedY + rectHeight > winHeight - pad)
      adjustedY = Math.max(pad, winHeight - rectHeight - pad);
    const finalX = Math.round(Math.max(pad, Math.min(adjustedX, winWidth - rectWidth - pad)));
    const finalY = Math.round(Math.max(pad, Math.min(adjustedY, winHeight - rectHeight - pad)));
    if (finalX !== menuState.x || finalY !== menuState.y)
      setMenuState((prev) => ({ ...prev, x: finalX, y: finalY }));
  }, [menuState.isOpen]);

  const handleContextMenu = (e: React.MouseEvent) => {
    clearHover();
    menuTabRef.current = dashboardTabForTarget(e.target);
    e.preventDefault();
    e.stopPropagation();
    const scale = (loadUiAdjustmentPreferences().overlayScale || 100) / 100;
    const winWidth = (window.innerWidth || 340) / scale,
      winHeight = (window.innerHeight || 80) / scale,
      clickX = e.clientX / scale,
      clickY = e.clientY / scale,
      pad = 4 / scale;
    const menuWidth = 95;
    const menuHeight = 26;
    let posX = clickX;
    if (posX + menuWidth > winWidth - pad) posX = Math.max(pad, clickX - menuWidth);
    let posY = clickY;
    if (posY + menuHeight > winHeight - pad) posY = Math.max(pad, clickY - menuHeight);
    setMenuState({
      isOpen: true,
      x: Math.round(Math.max(pad, Math.min(posX, winWidth - menuWidth - pad))),
      y: Math.round(Math.max(pad, Math.min(posY, winHeight - menuHeight - pad))),
    });
  };

  const handleRefreshUsage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuState((prev) => ({ ...prev, isOpen: false }));
    setData((prev) => ({ ...prev, loading: true }));
    try {
      await emit("request-refresh-usage", { provider: data.provider, accountId: data.accountId });
    } catch (err) {
      console.warn("Failed to request refresh from overlay:", err);
    }
  };

  const handleOpenDashboard = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuState((prev) => ({ ...prev, isOpen: false }));
    try {
      const tab = menuTabRef.current ?? data.provider;
      await invoke("show_dashboard", { tab });
    } catch (err) {
      console.warn("Failed to open dashboard:", err);
    }
  };

  const handleHideOverlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuState((prev) => ({ ...prev, isOpen: false }));
    try {
      localStorage.setItem("quotashift_overlay_enabled", "false");
      await emit("overlay-visibility-changed", false);
      await invoke("set_overlay_visible", { visible: false });
    } catch (err) {
      console.warn("Failed to hide overlay:", err);
    }
  };

  return {
    menuState,
    setMenuState,
    handleContextMenu,
    handleRefreshUsage,
    handleOpenDashboard,
    handleHideOverlay,
  };
}
