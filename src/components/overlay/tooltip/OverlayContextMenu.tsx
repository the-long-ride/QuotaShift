import React from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { loadUiAdjustmentPreferences } from "../../../utils/common/ui/ui-adjustment";
import { TEXT_TOOLTIP_WIDTH } from "./overlay-tooltip-placement";
import { OverlayMenuApplyItem } from "./OverlayMenuApplyItem";
import {
  MenuDashboardIcon,
  MenuHideIcon,
  MenuThemeIcon,
  MenuUntrackIcon,
} from "./OverlayContextMenuIcons";
import { OverlayMenuSwapOrientationItem } from "../OverlayMenuSwapOrientationItem";
import type { CircleOrientation } from "../../../utils/common/overlay/circle-layout";

export interface OverlayContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  appTheme: "light" | "dark";
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onRefreshUsage: (e: React.MouseEvent) => void;
  onOpenDashboard: (e: React.MouseEvent) => void;
  onToggleTheme: (e: React.MouseEvent) => void;
  onHideOverlay: (e: React.MouseEvent) => void;
  onUntrackAccount?: (e: React.MouseEvent) => void;
  onApplyAccount?: (e: React.MouseEvent) => void;
  circleOrientation?: CircleOrientation;
  onSwapOrientation?: (e: React.MouseEvent) => void;
  setMenuPos?: (pos: { x: number; y: number }) => void;
  disableTooltips?: boolean;
  localTooltips?: boolean;
  tooltipPlacement?: "above" | "below";
  menuPlacement?: "above" | "below" | "left" | "right";
}

export const OverlayContextMenu: React.FC<OverlayContextMenuProps> = ({
  isOpen,
  x,
  y,
  appTheme,
  menuRef,
  onRefreshUsage,
  onOpenDashboard,
  onToggleTheme,
  onHideOverlay,
  onUntrackAccount,
  onApplyAccount,
  circleOrientation,
  onSwapOrientation,
  disableTooltips = false,
  localTooltips = false,
  tooltipPlacement = "above",
  menuPlacement,
}) => {
  const [activeTooltip, setActiveTooltip] = React.useState<{
    text: string;
    left: number;
    translatePct: number;
  } | null>(null);
  const tooltipRequestRef = React.useRef(0);

  const hideTooltip = React.useCallback(() => {
    if (disableTooltips) return;
    if (localTooltips) {
      setActiveTooltip(null);
      return;
    }
    tooltipRequestRef.current += 1;
    emit("overlay-tooltip-data", { visible: false }).catch(() => {});
  }, [disableTooltips, localTooltips]);

  React.useEffect(() => {
    if (!isOpen) hideTooltip();
  }, [hideTooltip, isOpen]);

  const showTooltip = (text: string, event: React.SyntheticEvent<HTMLButtonElement>) => {
    if (disableTooltips) return;
    if (localTooltips) {
      const el = event.currentTarget;
      const center = el.offsetLeft + el.offsetWidth / 2;
      const menuWidth = menuRef.current?.offsetWidth ?? 0;
      let translatePct = -50;
      if (menuPlacement === "left" && menuWidth > 0 && menuWidth - center < 52) {
        translatePct = -90;
      } else if (menuPlacement === "right" && menuWidth > 0 && center < 52) {
        translatePct = -10;
      }
      setActiveTooltip({
        text,
        left: center,
        translatePct,
      });
      return;
    }
    const requestId = ++tooltipRequestRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const uiScale = (loadUiAdjustmentPreferences().overlayScale || 100) / 100;
    const win = getCurrentWebviewWindow();

    Promise.all([win.outerPosition(), win.outerSize()])
      .then(([position, outerSize]) => {
        if (requestId !== tooltipRequestRef.current) return;

        const cssViewportWidth = Math.max(1, window.innerWidth || outerSize.width);
        const nativeScale = outerSize.width / cssViewportWidth || window.devicePixelRatio || 1;
        const tooltipWidth = Math.round(TEXT_TOOLTIP_WIDTH * uiScale * nativeScale);
        const tooltipHeight = Math.round(38 * uiScale * nativeScale);
        const screenWithOffsets = window.screen as Screen & {
          availTop?: number;
        };
        const minY = (screenWithOffsets.availTop ?? 0) * nativeScale;
        const maxY = ((screenWithOffsets.availTop ?? 0) + window.screen.availHeight) * nativeScale;
        const visualLeft = rect.left;
        const visualWidth = rect.width;
        const visualTop = rect.top;
        const visualHeight = rect.height;
        const buttonCenterX = position.x + (visualLeft + visualWidth / 2) * nativeScale;
        const buttonTop = position.y + visualTop * nativeScale;
        const buttonBottom = buttonTop + visualHeight * nativeScale;
        const fitsAbove = buttonTop - tooltipHeight >= minY;
        const fitsBelow = buttonBottom + tooltipHeight <= maxY;
        const placement = fitsAbove || !fitsBelow ? "above" : "below";
        const x = Math.round(buttonCenterX - tooltipWidth / 2);
        const y = Math.round(
          placement === "above"
            ? buttonTop - tooltipHeight + 4 * nativeScale
            : buttonBottom - 4 * nativeScale,
        );

        emit("overlay-tooltip-data", {
          text,
          placement,
          x,
          y,
          cardCenterX: Math.round(buttonCenterX),
          maxWidth: outerSize.width,
          source: "menu",
          visible: true,
        }).catch(() => {});
      })
      .catch(() => {});
  };

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="overlay-context-menu"
      style={{ left: `${x}px`, top: `${y}px` }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {activeTooltip && (
        <div
          className={`overlay-tooltip ${tooltipPlacement === "below" ? "overlay-tooltip--below" : "overlay-tooltip--above"} overlay-tooltip--menu`}
          role="tooltip"
          style={{
            position: "absolute",
            ...(tooltipPlacement === "below"
              ? { top: "calc(100% + 4px)", bottom: "auto" }
              : { bottom: "calc(100% + 4px)", top: "auto" }),
            left: `${activeTooltip.left}px`,
            transform: `translateX(${activeTooltip.translatePct}%)`,
            whiteSpace: "nowrap",
          }}
        >
          <span className="overlay-tooltip-text">{activeTooltip.text}</span>
        </div>
      )}
      {onApplyAccount && (
        <OverlayMenuApplyItem
          onClick={onApplyAccount}
          showTooltip={showTooltip}
          hideTooltip={hideTooltip}
        />
      )}
      <button
        type="button"
        className="overlay-menu-item"
        onClick={onRefreshUsage}
        data-tooltip="Refresh usage"
        aria-label="Refresh usage"
        onMouseEnter={(event) => showTooltip("Refresh usage", event)}
        onMouseLeave={hideTooltip}
        onFocus={(event) => showTooltip("Refresh usage", event)}
        onBlur={hideTooltip}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
      </button>
      <button
        type="button"
        className="overlay-menu-item"
        onClick={onOpenDashboard}
        data-tooltip="Open dashboard"
        aria-label="Open dashboard"
        onMouseEnter={(event) => showTooltip("Open dashboard", event)}
        onMouseLeave={hideTooltip}
        onFocus={(event) => showTooltip("Open dashboard", event)}
        onBlur={hideTooltip}
      >
        <MenuDashboardIcon />
      </button>
      <button
        type="button"
        className="overlay-menu-item"
        onClick={onToggleTheme}
        data-tooltip={appTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={appTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        onMouseEnter={(event) =>
          showTooltip(appTheme === "dark" ? "Switch to light mode" : "Switch to dark mode", event)
        }
        onMouseLeave={hideTooltip}
        onFocus={(event) =>
          showTooltip(appTheme === "dark" ? "Switch to light mode" : "Switch to dark mode", event)
        }
        onBlur={hideTooltip}
      >
        <MenuThemeIcon appTheme={appTheme} />
      </button>
      {circleOrientation && onSwapOrientation && (
        <OverlayMenuSwapOrientationItem
          orientation={circleOrientation}
          onClick={onSwapOrientation}
          showTooltip={showTooltip}
          hideTooltip={hideTooltip}
        />
      )}
      {onUntrackAccount && (
        <button
          type="button"
          className="overlay-menu-item overlay-menu-item--danger"
          onClick={onUntrackAccount}
          data-tooltip="Untrack this account"
          aria-label="Untrack this account"
          onMouseEnter={(event) => showTooltip("Untrack this account", event)}
          onMouseLeave={hideTooltip}
          onFocus={(event) => showTooltip("Untrack this account", event)}
          onBlur={hideTooltip}
        >
          <MenuUntrackIcon />
        </button>
      )}
      <button
        type="button"
        className="overlay-menu-item overlay-menu-item--danger"
        onClick={onHideOverlay}
        data-tooltip="Hide overlay"
        aria-label="Hide overlay"
        onMouseEnter={(event) => showTooltip("Hide overlay", event)}
        onMouseLeave={hideTooltip}
        onFocus={(event) => showTooltip("Hide overlay", event)}
        onBlur={hideTooltip}
      >
        <MenuHideIcon />
      </button>
    </div>
  );
};
