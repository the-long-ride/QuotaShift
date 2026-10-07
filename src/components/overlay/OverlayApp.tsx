import React, { useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { APP_THEME_EVENT, THEME_KEY } from "../../utils/common/app-constants";
import { getOverlayTooltipText, OverlayHoverZone } from "../../utils/common/overlay-tooltip";
import { resolveTierBadgeText } from "./OverlayCard";
import { OverlayCardStack, resolveHoveredCardIndex } from "./OverlayCardStack";
import { useOverlayTooltipPublish } from "./useOverlayTooltipPublish";
import { listOverlayAccounts } from "../../utils/common/overlay-extra-accounts";
import { OverlayContextMenu } from "./OverlayContextMenu";
import { useOverlayDrag } from "./useOverlayDrag";
import { useOverlayDataAndWindow } from "./useOverlayDataAndWindow";
import { useOverlayContextMenu } from "./useOverlayContextMenu";
import {
  UI_ADJUSTMENT_EVENT,
  UI_ADJUSTMENT_STORAGE_KEY,
  loadUiAdjustmentPreferences,
  normalizeUiAdjustmentPreferences,
  type OverlayTheme,
  type UiAdjustmentPreferences,
} from "../../utils/common/ui-adjustment";

export type { OverlayQuotaRow } from "../../utils/common/overlay-types";
import type { OverlayAccountData as BaseOverlayAccountData } from "../../utils/common/overlay-types";

export interface OverlaySingleBar {
  label: string;
  percent: number | null;
}

export interface OverlayAccountData extends BaseOverlayAccountData {
  provider: "antigravity" | "codex" | "claude";
  singleBars?: OverlaySingleBar[];
  resetCount?: number | null;
  resetNearestExpiresAt?: string | null;
  additionalAccounts?: OverlayAccountData[];
}

export const OverlayApp: React.FC = () => {
  const lastWindowPosRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [hoverZone, setHoverZone] = useState<OverlayHoverZone | null>(null);
  const [activeTooltipZone, setActiveTooltipZone] = useState<OverlayHoverZone | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const hoverZoneRef = useRef<OverlayHoverZone | null>(null);
  hoverZoneRef.current = hoverZone;

  const clearHover = () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverZone(null);
    setActiveTooltipZone(null);
    emit("overlay-tooltip-data", { visible: false }).catch(() => {});
  };

  const [menuOpenState, setMenuOpenState] = useState(false);
  const [overlayTheme, setOverlayTheme] = useState<OverlayTheme>(
    () => loadUiAdjustmentPreferences().overlayTheme,
  );
  const [appTheme, setAppTheme] = useState<"light" | "dark">(() =>
    localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark",
  );

  useEffect(() => {
    let unlistenUi: (() => void) | null = null;
    let unlistenTheme: (() => void) | null = null;
    let cancelled = false;

    const applyTheme = (preferences?: UiAdjustmentPreferences & { appTheme?: string }) => {
      const normalized = normalizeUiAdjustmentPreferences(
        preferences ?? loadUiAdjustmentPreferences(),
      );
      const nextTheme = normalized.overlayTheme;
      const nextAppTheme =
        preferences?.appTheme === "light" || preferences?.appTheme === "dark"
          ? preferences.appTheme
          : document.documentElement.getAttribute("data-theme") === "light"
            ? "light"
            : "dark";
      setOverlayTheme(nextTheme);
      setAppTheme(nextAppTheme);
      document.documentElement.setAttribute("data-overlay-theme", nextTheme);
      document.documentElement.setAttribute("data-theme", nextAppTheme);
    };

    applyTheme({
      ...loadUiAdjustmentPreferences(),
      appTheme: localStorage.getItem(THEME_KEY) || undefined,
    });
    void listen<UiAdjustmentPreferences & { appTheme?: string }>(UI_ADJUSTMENT_EVENT, (event) => {
      applyTheme(event.payload);
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenUi = unlisten;
    });

    void listen<string>(APP_THEME_EVENT, (event) => {
      applyTheme({ ...loadUiAdjustmentPreferences(), appTheme: event.payload });
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenTheme = unlisten;
    });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === UI_ADJUSTMENT_STORAGE_KEY) applyTheme();
      if (event.key === THEME_KEY) {
        applyTheme({ ...loadUiAdjustmentPreferences(), appTheme: event.newValue || undefined });
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      cancelled = true;
      unlistenUi?.();
      unlistenTheme?.();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const cardsRef = useRef<OverlayAccountData[]>([]);
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    resetDragIntent,
    updateMonitorBounds,
    isDragging,
    screenBoundsRef,
  } = useOverlayDrag({
    lastWindowPosRef,
    isMenuOpen: menuOpenState,
    onCloseMenu: () => setMenuOpenState(false),
    clearHover,
    setHoverZone,
    cardsRef,
  });

  const { data, setData, avatarError, setAvatarError } = useOverlayDataAndWindow(
    lastWindowPosRef,
    updateMonitorBounds,
  );

  const cards = listOverlayAccounts(data);
  cardsRef.current = cards;

  const {
    menuState,
    setMenuState,
    handleContextMenu,
    handleRefreshUsage,
    handleOpenDashboard,
    handleUntrackAccount,
    handleHideOverlay,
  } = useOverlayContextMenu({
    data,
    setData,
    clearHover,
    menuRef,
    cards,
  });

  useEffect(() => {
    setMenuOpenState(menuState.isOpen);
  }, [menuState.isOpen]);

  const handleToggleAppTheme = (event: React.MouseEvent) => {
    event.stopPropagation();
    const nextTheme = appTheme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, nextTheme);
    setAppTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    void emit(APP_THEME_EVENT, nextTheme);
  };
  const [hoveredCardIndex, setHoveredCardIndex] = useState(0);
  const activeIndex = hoveredCardIndex < cards.length ? hoveredCardIndex : 0;
  const tooltipData = cards[activeIndex] ?? data;
  const showTooltip = activeTooltipZone !== null && !isDragging && !menuState.isOpen;
  const tierText = resolveTierBadgeText(tooltipData.provider, tooltipData.tier);
  const tooltipText = getOverlayTooltipText(activeTooltipZone, tooltipData, tierText);
  const handleStackMouseMove = (event: React.MouseEvent) => {
    setHoveredCardIndex(resolveHoveredCardIndex(event.target as HTMLElement, cards.length));
    handleMouseMove(event);
  };

  useEffect(() => {
    if (!hoverZone) {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setActiveTooltipZone(null);
      return;
    }
    if (activeTooltipZone) {
      setActiveTooltipZone(hoverZone);
      return;
    }
    if (!hoverTimerRef.current) {
      hoverTimerRef.current = window.setTimeout(() => {
        setActiveTooltipZone(hoverZoneRef.current);
        hoverTimerRef.current = null;
      }, 500);
    }
  }, [hoverZone, Boolean(activeTooltipZone)]);

  useOverlayTooltipPublish({
    showTooltip,
    tooltipText,
    activeIndex,
    containerRef,
    lastWindowPosRef,
    screenBoundsRef,
  });

  return (
    <>
      <div
        ref={containerRef}
        className={`overlay-container overlay-container--${data.provider}`}
        data-provider={data.provider}
        data-overlay-theme={overlayTheme}
        data-theme={appTheme}
        onMouseDown={handleMouseDown}
        onMouseMove={handleStackMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={clearHover}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
        onLostPointerCapture={resetDragIntent}
      >
        <OverlayCardStack
          cards={cards}
          avatarError={avatarError}
          setAvatarError={setAvatarError}
          showTooltip={showTooltip}
          tooltipText={tooltipText}
          activeIndex={activeIndex}
        />
      </div>
      <OverlayContextMenu
        isOpen={menuState.isOpen}
        x={menuState.x}
        y={menuState.y}
        appTheme={appTheme}
        menuRef={menuRef}
        onClose={() => setMenuState((prev) => ({ ...prev, isOpen: false }))}
        onRefreshUsage={handleRefreshUsage}
        onOpenDashboard={handleOpenDashboard}
        onToggleTheme={handleToggleAppTheme}
        onHideOverlay={handleHideOverlay}
        onUntrackAccount={handleUntrackAccount}
      />
    </>
  );
};
