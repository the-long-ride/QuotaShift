import React, { useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { APP_THEME_EVENT, THEME_KEY } from "../../utils/common/app-constants";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getOverlayTooltipText, OverlayHoverZone } from "../../utils/common/overlay-tooltip";
import { OverlayCard, barColor, resolveTierBadgeText } from "./OverlayCard";
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

export { barColor, resolveTierBadgeText };

export interface OverlayQuotaRow {
  label: string;
  fiveHourPercent: number | null;
  weeklyPercent: number | null;
}
export interface OverlaySingleBar {
  label: string;
  percent: number | null;
}
export interface OverlayAccountData {
  provider: "antigravity" | "codex" | "claude";
  accountId?: string | null;
  label: string;
  email?: string | null;
  avatarUrl?: string | null;
  tier?: string | null;
  fiveHourPercent?: number | null;
  weeklyPercent?: number | null;
  singleBars?: OverlaySingleBar[];
  quotaRows?: OverlayQuotaRow[];
  loading?: boolean;
  resetCount?: number | null;
  resetNearestExpiresAt?: string | null;
  claudeGuardrails?: {
    fiveHourEnabled: boolean;
    fiveHourThresholdPct: number;
    weeklyEnabled: boolean;
    weeklyThresholdPct: number;
  };
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
  });

  const { data, setData, avatarError, setAvatarError } = useOverlayDataAndWindow(
    lastWindowPosRef,
    updateMonitorBounds,
  );

  const {
    menuState,
    setMenuState,
    handleContextMenu,
    handleRefreshUsage,
    handleOpenDashboard,
    handleHideOverlay,
  } = useOverlayContextMenu({
    data,
    setData,
    clearHover,
    menuRef,
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

  const showTooltip = activeTooltipZone !== null && !isDragging && !menuState.isOpen;
  const tierText = resolveTierBadgeText(data.provider, data.tier);
  const tooltipText = getOverlayTooltipText(activeTooltipZone, data, tierText);

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

  useEffect(() => {
    if (showTooltip && tooltipText) {
      const scale = window.devicePixelRatio || 1;
      const screenBounds =
        screenBoundsRef.current ||
        (typeof window !== "undefined" && window.screen?.availWidth
          ? {
              minX: 0,
              maxX: window.screen.availWidth * scale,
              minY: 0,
              maxY: (window.screen.availHeight || 1080) * scale,
            }
          : null);

      const publish = (
        wPos: { x: number; y: number },
        overlaySize: { width: number; height: number },
      ) => {
        const uiScale = (loadUiAdjustmentPreferences().overlayScale || 100) / 100;
        const tooltipWidth = Math.round(340 * uiScale * scale);
        const tooltipHeight = Math.round(38 * uiScale * scale);
        const overlap = Math.round(4 * scale);
        const overlayCenterX = wPos.x + overlaySize.width / 2;
        const overlayBottom = wPos.y + overlaySize.height;
        let placement: "above" | "below" = "below";
        let y = overlayBottom - overlap;

        if (screenBounds && overlayBottom + tooltipHeight > screenBounds.maxY) {
          placement = "above";
          y = Math.max(screenBounds.minY, wPos.y - tooltipHeight + overlap);
        }

        emit("overlay-tooltip-data", {
          text: tooltipText,
          placement,
          x: Math.round(overlayCenterX - tooltipWidth / 2),
          y: Math.round(y),
          cardCenterX: Math.round(overlayCenterX),
          visible: true,
        }).catch(() => {});
      };

      const win = getCurrentWebviewWindow();
      Promise.all([win.outerPosition(), win.outerSize()])
        .then(([pos, size]) => {
          lastWindowPosRef.current = { x: pos.x, y: pos.y };
          publish({ x: pos.x, y: pos.y }, { width: size.width, height: size.height });
        })
        .catch(() => {
          const fallbackPos = lastWindowPosRef.current || { x: 0, y: 0 };
          publish(fallbackPos, {
            width: Math.round((window.outerWidth || window.innerWidth || 340) * scale),
            height: Math.round((window.outerHeight || window.innerHeight || 80) * scale),
          });
        });
    } else emit("overlay-tooltip-data", { visible: false }).catch(() => {});
  }, [showTooltip, tooltipText]);

  return (
    <>
      <div
        ref={containerRef}
        className={`overlay-container overlay-container--${data.provider}`}
        data-provider={data.provider}
        data-overlay-theme={overlayTheme}
        data-theme={appTheme}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={clearHover}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
        onLostPointerCapture={resetDragIntent}
      >
        <OverlayCard
          data={data}
          avatarError={avatarError}
          setAvatarError={setAvatarError}
          showTooltip={showTooltip}
          tooltipText={tooltipText}
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
      />
    </>
  );
};
