import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { OverlayAccountData } from "./OverlayApp";
import { loadUiAdjustmentPreferences } from "../../utils/common/ui-adjustment";
import { dashboardTabForTarget } from "./OverlayCardStack";
import { listOverlayAccounts } from "../../utils/common/overlay-extra-accounts";
import { resolveTargetAccountFromClick } from "../../utils/common/overlay-card-target";
import { FOCUS_ACCOUNT_CARD_EVENT } from "../../utils/common/account-card-scroll";

export interface UseOverlayContextMenuOptions {
  data: OverlayAccountData;
  setData: React.Dispatch<React.SetStateAction<OverlayAccountData>>;
  clearHover: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  cards?: OverlayAccountData[];
}

export function useOverlayContextMenu({
  data,
  setData,
  clearHover,
  menuRef,
  cards,
}: UseOverlayContextMenuOptions) {
  // Provider tab of the right-clicked card; "Open dashboard" lands on it.
  const menuTabRef = useRef<string | null>(null);
  const targetAccountRef = useRef<{
    provider: OverlayAccountData["provider"];
    accountId?: string | null;
  } | null>(null);
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
    const resolved = resolveTargetAccountFromClick(
      e.target,
      e.clientY,
      cards ?? listOverlayAccounts(data),
    );
    targetAccountRef.current = {
      provider: resolved.provider,
      accountId: resolved.accountId,
    };
    if (resolved.provider) menuTabRef.current = resolved.provider;
    e.preventDefault();
    e.stopPropagation();
    const scale = (loadUiAdjustmentPreferences().overlayScale || 100) / 100;
    const winWidth = (window.innerWidth || 340) / scale,
      winHeight = (window.innerHeight || 80) / scale,
      clickX = e.clientX / scale,
      clickY = e.clientY / scale,
      pad = 4 / scale;
    const menuWidth = 136;
    const menuHeight = 31;
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
    const target = targetAccountRef.current ?? {
      provider: data.provider,
      accountId: data.accountId,
    };
    setData((prev) => {
      if (!target.accountId || prev.accountId === target.accountId) {
        return { ...prev, loading: true };
      }
      return {
        ...prev,
        additionalAccounts: (prev.additionalAccounts || []).map((acc) =>
          acc.accountId === target.accountId ? { ...acc, loading: true } : acc,
        ),
      };
    });
    try {
      await emit("request-refresh-usage", {
        provider: data.provider,
        accountId: target.accountId,
      });
    } catch (err) {
      console.warn("Failed to request refresh from overlay:", err);
    }
  };

  const handleOpenDashboard = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuState((prev) => ({ ...prev, isOpen: false }));
    try {
      const target = targetAccountRef.current;
      const accountId = target?.accountId ?? data.accountId;
      const focusTab = menuTabRef.current ?? target?.provider ?? data.provider;
      if (focusTab) {
        emit(FOCUS_ACCOUNT_CARD_EVENT, {
          provider: focusTab,
          accountId,
        }).catch(() => {});
      }
      const tab = menuTabRef.current ?? data.provider;
      await invoke("show_dashboard", { tab });
    } catch (err) {
      console.warn("Failed to open dashboard:", err);
    }
  };

  const handleUntrackAccount = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuState((prev) => ({ ...prev, isOpen: false }));
    const target = targetAccountRef.current ?? {
      provider: data.provider,
      accountId: data.accountId,
    };
    if (target.provider && target.accountId) {
      try {
        await emit("request-untrack-account", {
          provider: target.provider,
          accountId: target.accountId,
        });
      } catch (err) {
        console.warn("Failed to request untrack from overlay:", err);
      }
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
    handleUntrackAccount,
    handleHideOverlay,
  };
}
