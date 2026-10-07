import React from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { loadUiAdjustmentPreferences } from "../../utils/common/ui-adjustment";
import { TEXT_TOOLTIP_WIDTH } from "./overlay-tooltip-placement";

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
  setMenuPos?: (pos: { x: number; y: number }) => void;
  disableTooltips?: boolean;
  localTooltips?: boolean;
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
  disableTooltips = false,
  localTooltips = false,
}) => {
  const [activeTooltip, setActiveTooltip] = React.useState<{
    text: string;
    left: number;
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
      setActiveTooltip({
        text,
        left: el.offsetLeft + el.offsetWidth / 2,
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
          className="overlay-tooltip overlay-tooltip--above overlay-tooltip--menu"
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            left: `${activeTooltip.left}px`,
            top: "auto",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}
        >
          <span className="overlay-tooltip-text">{activeTooltip.text}</span>
        </div>
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
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
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
        {appTheme === "dark" ? (
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
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
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
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
          </svg>
        )}
      </button>
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
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="17" y1="11" x2="22" y2="11" />
          </svg>
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
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </button>
    </div>
  );
};
