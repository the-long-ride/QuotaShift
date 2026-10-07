import { useEffect, type RefObject } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { loadUiAdjustmentPreferences } from "../../utils/common/ui-adjustment";
import {
  hoveredCardAnchor,
  settledCardAnchor,
  type HoveredCardAnchor,
} from "./overlay-tooltip-anchor";
import { TEXT_TOOLTIP_HEIGHT, TEXT_TOOLTIP_WIDTH } from "./overlay-tooltip-placement";

interface ScreenBounds {
  minY: number;
  maxY: number;
}

interface OverlayTooltipPublishArgs {
  showTooltip: boolean;
  tooltipText: string | null;
  activeIndex: number;
  containerRef: RefObject<HTMLDivElement | null>;
  lastWindowPosRef: { current: { x: number; y: number } | null };
  screenBoundsRef: { readonly current: ScreenBounds | null };
}

/**
 * Publishes the hovered card's tooltip to the standalone tooltip window. The anchor is read only
 * after the overlay layout settled (cards, paging arrows and the native window size), and a
 * superseded hover never publishes.
 */
export function useOverlayTooltipPublish({
  showTooltip,
  tooltipText,
  activeIndex,
  containerRef,
  lastWindowPosRef,
  screenBoundsRef,
}: OverlayTooltipPublishArgs): void {
  useEffect(() => {
    if (!showTooltip || !tooltipText) {
      emit("overlay-tooltip-data", { visible: false }).catch(() => {});
      return;
    }
    const scale = window.devicePixelRatio || 1;
    const screenBounds: ScreenBounds | null =
      screenBoundsRef.current ||
      (window.screen?.availWidth
        ? { minY: 0, maxY: (window.screen.availHeight || 1080) * scale }
        : null);

    let cancelled = false;
    const publish = (
      wPos: { x: number; y: number },
      overlaySize: { width: number; height: number },
      { centerX: overlayCenterX, width: cardWidth }: HoveredCardAnchor,
    ) => {
      if (cancelled) return;
      const uiScale = (loadUiAdjustmentPreferences().overlayScale || 100) / 100;
      const tooltipWidth = Math.round(TEXT_TOOLTIP_WIDTH * uiScale * scale);
      const tooltipHeight = Math.round(TEXT_TOOLTIP_HEIGHT * uiScale * scale);
      const overlap = Math.round(4 * scale);
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
        maxWidth: Math.round(cardWidth),
        visible: true,
      }).catch(() => {});
    };

    settledCardAnchor(getCurrentWebviewWindow(), containerRef.current, activeIndex)
      .then(({ position, size, anchor }) => {
        lastWindowPosRef.current = position;
        publish(position, size, anchor);
      })
      .catch(() => {
        const fallbackPos = lastWindowPosRef.current || { x: 0, y: 0 };
        const fallbackSize = {
          width: Math.round((window.outerWidth || window.innerWidth || 340) * scale),
          height: Math.round((window.outerHeight || window.innerHeight || 80) * scale),
        };
        publish(
          fallbackPos,
          fallbackSize,
          hoveredCardAnchor(containerRef.current, activeIndex, fallbackPos.x, fallbackSize.width),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [showTooltip, tooltipText, activeIndex]);
}
