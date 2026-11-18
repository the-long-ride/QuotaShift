import React, { useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { APP_THEME_EVENT, THEME_KEY } from "../../utils/common/backup/app-constants";
import { OverlayCardStack } from "./OverlayCardStack";
import { OverlayCircleStack } from "./OverlayCircleStack";
import { useCircleOverlayActions } from "./useCircleOverlayActions";
import { listOverlayAccounts } from "../../utils/common/overlay/overlay-extra-accounts";
import { OverlayContextMenu } from "./tooltip/OverlayContextMenu";
import { useOverlayDrag } from "./useOverlayDrag";
import { useOverlayDataAndWindow } from "./useOverlayDataAndWindow";
import { useOverlayContextMenu } from "./tooltip/useOverlayContextMenu";
import {
  UI_ADJUSTMENT_EVENT,
  UI_ADJUSTMENT_STORAGE_KEY,
  loadUiAdjustmentPreferences,
  normalizeUiAdjustmentPreferences,
  type OverlayTheme,
  type UiAdjustmentPreferences,
} from "../../utils/common/ui/ui-adjustment";

export type { OverlayQuotaRow } from "../../utils/common/overlay-types";
import type {
  OverlayAccountData as BaseOverlayAccountData,
  OverlaySingleBar,
} from "../../utils/common/overlay-types";

export type { OverlaySingleBar };

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

  const circleMenuOpenRef = useRef(false);
  const cardMenuOpenRef = useRef(false);
  const handleLeaveNodeRef = useRef<() => void>(() => {});
  const updateMonitorBoundsRef = useRef<() => Promise<void>>(async () => {});
  const noopSetHoverZone = () => {};

  const clearHover = () => {
    handleLeaveNodeRef.current();
    if (circleMenuOpenRef.current) return;
    emit("overlay-tooltip-data", { visible: false }).catch(() => {});
  };

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
  const { data, setData, avatarError, setAvatarError } = useOverlayDataAndWindow(
    lastWindowPosRef,
    () => updateMonitorBoundsRef.current(),
  );

  const cards = listOverlayAccounts(data);
  cardsRef.current = cards;

  const {
    menuState,
    setMenuState,
    handleContextMenu,
    handleRefreshUsage,
    handleOpenDashboard,
    handleManageMonitored,
    handleApplyAccount,
    handleHideOverlay,
  } = useOverlayContextMenu({
    data,
    setData,
    clearHover,
    menuRef,
    cards,
  });

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
    isDraggingNow,
  } = useOverlayDrag({
    lastWindowPosRef,
    isMenuOpen: menuState.isOpen,
    onCloseMenu: () => setMenuState((prev) => ({ ...prev, isOpen: false })),
    clearHover,
    setHoverZone: noopSetHoverZone,
    cardsRef,
  });
  updateMonitorBoundsRef.current = updateMonitorBounds;
  cardMenuOpenRef.current = menuState.isOpen;

  const handleToggleAppTheme = (event: React.MouseEvent) => {
    event.stopPropagation();
    const nextTheme = appTheme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, nextTheme);
    setAppTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    void emit(APP_THEME_EVENT, nextTheme);
  };
  const handleStackMouseMove = (event: React.MouseEvent) => {
    handleMouseMove(event);
  };

  const {
    isCircleMode,
    circleOrientation,
    swapCircleOrientation,
    suppressHoverRef,
    isHoverSuppressedRef,
    handleHoverNode,
    handleLeaveNode,
    handleContextMenuNode,
  } = useCircleOverlayActions(circleMenuOpenRef);
  suppressHoverRef.current = isDragging || menuState.isOpen;
  isHoverSuppressedRef.current = () => isDraggingNow() || cardMenuOpenRef.current;
  handleLeaveNodeRef.current = handleLeaveNode;

  return (
    <>
      <div
        ref={containerRef}
        className={`overlay-container overlay-container--${data.provider}`}
        data-provider={data.provider}
        data-overlay-theme={overlayTheme}
        data-theme={appTheme}
        data-overlay-layout={isCircleMode ? "circle" : "card"}
        data-stack-orientation={circleOrientation}
        data-circle-orientation={isCircleMode ? circleOrientation : undefined}
        onMouseDown={handleMouseDown}
        onMouseMove={handleStackMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={clearHover}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={isCircleMode ? undefined : handleContextMenu}
        onLostPointerCapture={resetDragIntent}
      >
        {isCircleMode ? (
          <OverlayCircleStack
            cards={cards}
            orientation={circleOrientation}
            avatarError={avatarError}
            setAvatarError={setAvatarError}
            onHoverNode={handleHoverNode}
            onLeaveNode={handleLeaveNode}
            onContextMenuNode={handleContextMenuNode}
          />
        ) : (
          <OverlayCardStack
            cards={cards}
            orientation={circleOrientation}
            avatarError={avatarError}
            setAvatarError={setAvatarError}
            onHoverCard={handleHoverNode}
            onLeaveCard={handleLeaveNode}
          />
        )}
      </div>
      {!isCircleMode && (
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
          onManageMonitored={menuState.canManageMonitored ? handleManageMonitored : undefined}
          onApplyAccount={menuState.canApply ? handleApplyAccount : undefined}
          circleOrientation={circleOrientation}
          onSwapOrientation={(e) => {
            e.stopPropagation();
            setMenuState((prev) => ({ ...prev, isOpen: false }));
            swapCircleOrientation();
          }}
        />
      )}
    </>
  );
};
