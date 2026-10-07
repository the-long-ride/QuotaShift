import React, { useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { availableMonitors } from "@tauri-apps/api/window";
import { detectOverlayHoverZone, OverlayHoverZone } from "../../utils/common/overlay-tooltip";
import { clampPositionToScreen } from "./overlay-position";
import { dashboardTabForTarget } from "./OverlayCardStack";
import { FOCUS_ACCOUNT_CARD_EVENT } from "../../utils/common/account-card-scroll";
import { resolveTargetAccountFromClick } from "../../utils/common/overlay-card-target";
import type { OverlayAccountData } from "./OverlayApp";

export const DRAG_THRESHOLD_PX = 4;
export const DOUBLE_CLICK_WINDOW_MS = 500;
export const DOUBLE_CLICK_DISTANCE_PX = 6;
export const STORAGE_OVERLAY_POS_KEY = "quotashift_overlay_pos";

export interface UseOverlayDragOptions {
  lastWindowPosRef: React.MutableRefObject<{ x: number; y: number } | null>;
  isMenuOpen: boolean;
  onCloseMenu: () => void;
  clearHover: () => void;
  setHoverZone: React.Dispatch<React.SetStateAction<OverlayHoverZone | null>>;
  cards?: OverlayAccountData[];
  cardsRef?: React.MutableRefObject<OverlayAccountData[]>;
}

export function useOverlayDrag({
  lastWindowPosRef,
  isMenuOpen,
  onCloseMenu,
  clearHover,
  setHoverZone,
  cards,
  cardsRef,
}: UseOverlayDragOptions) {
  const monitorBoundsRef = useRef<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);
  const screenBoundsRef = useRef<{ minX: number; maxX: number; minY: number; maxY: number } | null>(
    null,
  );

  const updateMonitorBounds = async () => {
    try {
      const win = getCurrentWebviewWindow(),
        winSize = await win.outerSize(),
        monitors = (await availableMonitors()) || [];
      const boxes = monitors.map((m) => ({
        pos: m.workArea?.position ?? m.position,
        size: m.workArea?.size ?? m.size,
      }));
      if (boxes.length === 0) return;
      screenBoundsRef.current = {
        minX: Math.min(...boxes.map((b) => b.pos.x)),
        maxX: Math.max(...boxes.map((b) => b.pos.x + b.size.width)),
        minY: Math.min(...boxes.map((b) => b.pos.y)),
        maxY: Math.max(...boxes.map((b) => b.pos.y + b.size.height)),
      };
      monitorBoundsRef.current = {
        minX: screenBoundsRef.current.minX,
        maxX: screenBoundsRef.current.maxX - winSize.width,
        minY: screenBoundsRef.current.minY,
        maxY: screenBoundsRef.current.maxY - winSize.height,
      };
    } catch {}
  };

  const dragOriginRef = useRef<{
    pointerX: number;
    pointerY: number;
    windowX: number;
    windowY: number;
  } | null>(null);
  const dragStartedRef = useRef(false),
    pointerDownRef = useRef(false),
    isMovingRef = useRef(false);
  const pendingTargetPosRef = useRef<{ x: number; y: number } | null>(null),
    lastPressRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const moveHandlerRef = useRef<(e: React.MouseEvent) => void>(() => {});

  const resetDragIntent = () => {
    pointerDownRef.current = false;
    dragOriginRef.current = null;
    dragStartedRef.current = false;
    isMovingRef.current = false;
    pendingTargetPosRef.current = null;
    if (lastWindowPosRef.current) {
      clampPositionToScreen(lastWindowPosRef.current)
        .then((c) => {
          if (c || lastWindowPosRef.current)
            try {
              localStorage.setItem(
                STORAGE_OVERLAY_POS_KEY,
                JSON.stringify(c || lastWindowPosRef.current),
              );
            } catch {}
        })
        .catch(() => {});
    }
  };

  useEffect(() => {
    const handleGlobalRelease = () => {
      if (pointerDownRef.current) resetDragIntent();
    };
    const handleGlobalPointerMove = (e: MouseEvent) => {
      if (pointerDownRef.current) moveHandlerRef.current(e as unknown as React.MouseEvent);
    };
    window.addEventListener("pointermove", handleGlobalPointerMove, { passive: true });
    window.addEventListener("mousemove", handleGlobalPointerMove, { passive: true });
    window.addEventListener("pointerup", handleGlobalRelease);
    window.addEventListener("mouseup", handleGlobalRelease);
    window.addEventListener("blur", handleGlobalRelease);
    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("mousemove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalRelease);
      window.removeEventListener("mouseup", handleGlobalRelease);
      window.removeEventListener("blur", handleGlobalRelease);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 0)
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerDownRef.current) handleMouseMove(e as unknown as React.MouseEvent);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      resetDragIntent();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    clearHover();
    if (isMenuOpen) onCloseMenu();
    if (e.button !== 0) return;
    updateMonitorBounds();
    const pointerX = e.screenX,
      pointerY = e.screenY,
      now = performance.now();
    const previousPress = lastPressRef.current;
    const isDoubleClick =
      previousPress !== null &&
      now - previousPress.time <= DOUBLE_CLICK_WINDOW_MS &&
      Math.hypot(pointerX - previousPress.x, pointerY - previousPress.y) <=
        DOUBLE_CLICK_DISTANCE_PX;
    if (isDoubleClick) {
      lastPressRef.current = null;
      resetDragIntent();
      const tab = dashboardTabForTarget(e.target);
      const targetCards = cards ?? cardsRef?.current;
      const resolved = targetCards?.length
        ? resolveTargetAccountFromClick(e.target, e.clientY, targetCards)
        : null;
      const effectiveTab = resolved?.provider || tab || targetCards?.[0]?.provider;
      const accountId =
        resolved?.accountId ||
        (e.target as HTMLElement | null)
          ?.closest?.("[data-overlay-card-account-id]")
          ?.getAttribute("data-overlay-card-account-id") ||
        targetCards?.[0]?.accountId;
      if (effectiveTab) {
        emit(FOCUS_ACCOUNT_CARD_EVENT, { provider: effectiveTab, accountId }).catch(() => {});
      }
      invoke("show_dashboard", tab ? { tab } : {}).catch((err) =>
        console.warn("Failed to open main dashboard:", err),
      );
      return;
    }
    lastPressRef.current = { time: now, x: pointerX, y: pointerY };
    pointerDownRef.current = true;
    dragStartedRef.current = false;
    dragOriginRef.current = lastWindowPosRef.current
      ? {
          pointerX,
          pointerY,
          windowX: lastWindowPosRef.current.x,
          windowY: lastWindowPosRef.current.y,
        }
      : null;
    getCurrentWebviewWindow()
      .outerPosition()
      .then((position) => {
        lastWindowPosRef.current = { x: position.x, y: position.y };
        if (pointerDownRef.current && !dragStartedRef.current)
          dragOriginRef.current = { pointerX, pointerY, windowX: position.x, windowY: position.y };
      })
      .catch(() => {});
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!pointerDownRef.current && !isMenuOpen) {
      const zone = detectOverlayHoverZone(e.target as HTMLElement);
      setHoverZone((prev) => (prev !== zone ? zone : prev));
    }
    const origin = dragOriginRef.current;
    if (!origin || !pointerDownRef.current || (e.buttons & 1) !== 1) {
      resetDragIntent();
      return;
    }
    const scale = window.devicePixelRatio || 1,
      deltaX = (e.screenX - origin.pointerX) * scale,
      deltaY = (e.screenY - origin.pointerY) * scale;
    if (!dragStartedRef.current && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;
    if (!dragStartedRef.current) {
      dragStartedRef.current = true;
      lastPressRef.current = null;
      clearHover();
    }
    let targetX = Math.round(origin.windowX + deltaX),
      targetY = Math.round(origin.windowY + deltaY);
    const bounds = monitorBoundsRef.current;
    if (bounds) {
      targetX = Math.max(bounds.minX, Math.min(targetX, bounds.maxX));
      targetY = Math.max(bounds.minY, Math.min(targetY, bounds.maxY));
    }
    pendingTargetPosRef.current = { x: targetX, y: targetY };

    if (isMovingRef.current) return;
    isMovingRef.current = true;
    const commitPosition = (posX: number, posY: number) => {
      lastWindowPosRef.current = { x: posX, y: posY };
      getCurrentWebviewWindow()
        .setPosition(new PhysicalPosition(posX, posY))
        .catch(() => {})
        .finally(() => {
          isMovingRef.current = false;
          if (pointerDownRef.current && pendingTargetPosRef.current) {
            const next = pendingTargetPosRef.current;
            pendingTargetPosRef.current = null;
            if (next.x !== posX || next.y !== posY) {
              isMovingRef.current = true;
              commitPosition(next.x, next.y);
            }
          }
        });
    };
    pendingTargetPosRef.current = null;
    commitPosition(targetX, targetY);
  };

  moveHandlerRef.current = handleMouseMove;
  const handleMouseUp = () => {
    resetDragIntent();
  };

  const isDragging = dragStartedRef.current || pointerDownRef.current;

  return {
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
  };
}
