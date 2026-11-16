import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  CIRCLE_ORIENTATION_EVENT,
  CIRCLE_ORIENTATION_KEY,
  loadCircleOrientation,
  normalizeCircleOrientation,
  saveCircleOrientation,
  type CircleOrientation,
} from "../../utils/common/overlay/circle-layout";
import {
  DISPLAY_MODE_EVENT,
  DISPLAY_MODE_KEY,
  loadDisplayMode,
  type DisplayMode,
} from "../../utils/common/settings/display-mode";
import { buildTaskbarColumns } from "../../utils/common/ui/taskbar-columns";
import type { PanelPlacement } from "../../utils/common/ui/taskbar-panel-placement";
import type { OverlayAccountData } from "./OverlayApp";

export interface CirclePanelAnchor {
  placement: PanelPlacement;
  anchorX: number;
  anchorY: number;
}

/** Picks an unclipped side of the hovered circle based on stack orientation and screen edges. */
export function computeCirclePanelAnchor(
  orientation: CircleOrientation,
  winPos: { x: number; y: number },
  winSize: { width: number; height: number },
  rect: Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width" | "height">,
  viewportWidth: number,
  screenAvailRight?: number,
  screenAvailBottom?: number,
  dpr: number = 1,
): CirclePanelAnchor {
  const scale = winSize.width / Math.max(1, viewportWidth || winSize.width / Math.max(1, dpr));
  if (orientation === "vertical") {
    const rightEdge = winPos.x + rect.right * scale;
    const leftEdge = winPos.x + rect.left * scale;
    const maxRight = screenAvailRight ?? Number.POSITIVE_INFINITY;
    const preferLeft = rightEdge + 280 * scale > maxRight && leftEdge >= 280 * scale;
    return {
      placement: preferLeft ? "left" : "right",
      anchorX: Math.round(preferLeft ? leftEdge : rightEdge),
      anchorY: Math.round(winPos.y + (rect.top + rect.height / 2) * scale),
    };
  }
  const bottomEdge = winPos.y + rect.bottom * scale;
  const topEdge = winPos.y + rect.top * scale;
  const maxBottom = screenAvailBottom ?? Number.POSITIVE_INFINITY;
  const preferAbove = bottomEdge + 180 * scale > maxBottom && topEdge >= 160 * scale;
  return {
    placement: preferAbove ? "above" : "below",
    anchorX: Math.round(winPos.x + (rect.left + rect.width / 2) * scale),
    anchorY: Math.round(preferAbove ? topEdge : bottomEdge),
  };
}

/**
 * Owns Circle overlay mode & orientation state, rich TaskbarTooltipCard hover publication,
 * and unclipped external context menus for Circle nodes.
 */
export function useCircleOverlayActions(sharedMenuOpenRef?: React.MutableRefObject<boolean>) {
  const [isCircleMode, setIsCircleMode] = useState<boolean>(() => loadDisplayMode() === "circle");
  const [circleOrientation, setCircleOrientation] = useState<CircleOrientation>(() =>
    loadCircleOrientation(),
  );
  const hoverSeqRef = useRef(0);
  const menuOpenRef = useRef(false);
  const suppressHoverRef = useRef(false);
  const isHoverSuppressedRef = useRef<() => boolean>(() => false);
  const activeHoverKeyRef = useRef<string | null>(null);
  const setMenuOpen = useCallback(
    (open: boolean) => {
      menuOpenRef.current = open;
      if (sharedMenuOpenRef) sharedMenuOpenRef.current = open;
    },
    [sharedMenuOpenRef],
  );

  useEffect(() => {
    let cancelled = false;
    let unlistenMode: (() => void) | undefined;
    let unlistenOrientation: (() => void) | undefined;

    const handleStorage = (event: StorageEvent) => {
      if (event.key === DISPLAY_MODE_KEY) setIsCircleMode(loadDisplayMode() === "circle");
      if (event.key === CIRCLE_ORIENTATION_KEY) setCircleOrientation(loadCircleOrientation());
    };
    window.addEventListener("storage", handleStorage);

    void listen<DisplayMode>(DISPLAY_MODE_EVENT, (event) => {
      setIsCircleMode(event.payload === "circle");
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenMode = fn;
    });

    void listen<CircleOrientation>(CIRCLE_ORIENTATION_EVENT, (event) => {
      setCircleOrientation(normalizeCircleOrientation(event.payload));
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenOrientation = fn;
    });

    return () => {
      cancelled = true;
      unlistenMode?.();
      unlistenOrientation?.();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!isCircleMode) {
      hoverSeqRef.current += 1;
      setMenuOpen(false);
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen("taskbar-menu-closed", () => {
      setMenuOpen(false);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [isCircleMode, setMenuOpen]);

  const resolveAnchor = useCallback(
    async (element: HTMLElement): Promise<CirclePanelAnchor> => {
      const win = getCurrentWebviewWindow();
      const [winPos, winSize] = await Promise.all([win.outerPosition(), win.outerSize()]);
      const dpr = window.devicePixelRatio || 1;
      const rect = element.getBoundingClientRect();
      const scr = window.screen as Screen & { availLeft?: number; availTop?: number };
      const maxRight = scr?.availWidth ? ((scr.availLeft ?? 0) + scr.availWidth) * dpr : undefined;
      const maxBottom = scr?.availHeight
        ? ((scr.availTop ?? 0) + scr.availHeight) * dpr
        : undefined;
      return computeCirclePanelAnchor(
        circleOrientation,
        winPos,
        winSize,
        rect,
        window.innerWidth,
        maxRight,
        maxBottom,
        dpr,
      );
    },
    [circleOrientation],
  );

  const hideTooltip = useCallback(() => {
    activeHoverKeyRef.current = null;
    hoverSeqRef.current += 1;
    if (menuOpenRef.current) return;
    void emit("overlay-tooltip-data", { visible: false }).catch(() => {});
  }, []);

  const handleHoverNode = useCallback(
    (card: OverlayAccountData, element: HTMLElement) => {
      if (menuOpenRef.current || suppressHoverRef.current || isHoverSuppressedRef.current()) return;
      const cardKey = `${card.provider}:${card.accountId ?? card.label ?? ""}`;
      if (activeHoverKeyRef.current === cardKey) return;
      const details = buildTaskbarColumns(card)[0]?.details;
      if (!details) return;
      activeHoverKeyRef.current = cardKey;
      const seq = ++hoverSeqRef.current;
      void resolveAnchor(element)
        .then((anchor) => {
          if (
            seq !== hoverSeqRef.current ||
            menuOpenRef.current ||
            suppressHoverRef.current ||
            isHoverSuppressedRef.current()
          ) {
            if (activeHoverKeyRef.current === cardKey) activeHoverKeyRef.current = null;
            return;
          }
          void emit("overlay-tooltip-data", {
            visible: true,
            details,
            placement: anchor.placement,
            x: anchor.anchorX,
            y: anchor.anchorY,
            cardCenterX: anchor.anchorX,
            anchorY: anchor.anchorY,
          }).catch(() => {});
        })
        .catch(() => {
          if (activeHoverKeyRef.current === cardKey) activeHoverKeyRef.current = null;
        });
    },
    [resolveAnchor],
  );

  const handleContextMenuNode = useCallback(
    (card: OverlayAccountData, element: HTMLElement, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      activeHoverKeyRef.current = null;
      hoverSeqRef.current += 1;
      setMenuOpen(true);
      void resolveAnchor(element)
        .then((anchor) => {
          void emit("overlay-tooltip-data", {
            visible: true,
            menu: true,
            provider: card.provider,
            accountId: card.accountId ?? null,
            circleOrientation,
            placement: anchor.placement,
            x: anchor.anchorX,
            y: anchor.anchorY,
            cardCenterX: anchor.anchorX,
            anchorY: anchor.anchorY,
          }).catch(() => {});
        })
        .catch(() => {});
    },
    [circleOrientation, resolveAnchor, setMenuOpen],
  );

  const swapCircleOrientation = useCallback(() => {
    setCircleOrientation((prev) => {
      const next = prev === "horizontal" ? "vertical" : "horizontal";
      const saved = saveCircleOrientation(next);
      void emit(CIRCLE_ORIENTATION_EVENT, saved).catch(() => {});
      return saved;
    });
  }, []);

  return {
    isCircleMode,
    circleOrientation,
    swapCircleOrientation,
    suppressHoverRef,
    isHoverSuppressedRef,
    handleHoverNode,
    handleLeaveNode: hideTooltip,
    handleContextMenuNode,
  };
}
