import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { TaskbarColumn } from "./TaskbarColumn";
import { TaskbarNavArrow } from "./TaskbarNavArrow";
import { useTaskbarSlide } from "./useTaskbarSlide";
import { useTaskbarWindowSync } from "./useTaskbarWindowSync";
import {
  getNativeScale,
  useNativeZoomCompensation,
} from "../../hooks/desktop/useNativeZoomCompensation";
import { useMaxMonitoredCards } from "../../hooks/desktop/useMaxMonitoredCards";

export const MAX_VISIBLE_TASKBAR_ACCOUNTS = 3;
import {
  buildTaskbarColumns,
  taskbarTooltipText,
  type TaskbarColumn as Column,
} from "../../utils/common/ui/taskbar-columns";
import { FOCUS_ACCOUNT_CARD_EVENT } from "../../utils/common/accounts/account-card-scroll";
import {
  computeTaskbarPanelAnchor,
  isVerticalTaskbarEdge,
} from "../../utils/common/ui/taskbar-panel-placement";

export const TaskbarApp: React.FC = () => {
  const { data, overlayTheme, appTheme, edge } = useTaskbarWindowSync();
  const vertical = isVerticalTaskbarEdge(edge);
  const stripRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(() => buildTaskbarColumns(data), [data]);
  const maxVisibleAccounts = useMaxMonitoredCards();
  const [startIndex, setStartIndex] = useState(0);

  useEffect(() => {
    setStartIndex((prev) => {
      const maxStart = Math.max(0, columns.length - maxVisibleAccounts);
      return Math.min(prev, maxStart);
    });
  }, [columns.length, maxVisibleAccounts]);

  const hasMultiple = columns.length > maxVisibleAccounts;
  const visibleColumns = useMemo(
    () => (hasMultiple ? columns.slice(startIndex, startIndex + maxVisibleAccounts) : columns),
    [columns, hasMultiple, maxVisibleAccounts, startIndex],
  );
  const hasPrev = hasMultiple && startIndex > 0;
  const hasNext = hasMultiple && startIndex + maxVisibleAccounts < columns.length;

  const lastWheelTimeRef = useRef(0);
  const handleWheel = (event: React.WheelEvent) => {
    if (!hasMultiple) return;
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 160) return;
    const delta = event.deltaY || event.deltaX;
    if (Math.abs(delta) < 8) return;
    lastWheelTimeRef.current = now;
    if (delta > 0) {
      setStartIndex((prev) => Math.min(columns.length - maxVisibleAccounts, prev + 1));
    } else {
      setStartIndex((prev) => Math.max(0, prev - 1));
    }
  };

  useNativeZoomCompensation();
  useTaskbarSlide(stripRef, startIndex, vertical);

  // The native strip is sized by Rust from this report (CSS px), so the content drives it.
  // Layout sizes (`scrollWidth` is the full width even while the window is too narrow) stay in
  // native px when leaked page zoom is scaled back by a transform, unlike getBoundingClientRect.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const report = () => {
      const rect = strip.getBoundingClientRect();
      const measuredWidth = Math.ceil(Math.max(rect.width, strip.scrollWidth, strip.offsetWidth));
      const measuredHeight = Math.ceil(
        Math.max(rect.height, strip.scrollHeight, strip.offsetHeight),
      );
      invoke("set_taskbar_content_size", {
        width: vertical ? measuredWidth : measuredWidth + 4,
        height: vertical ? measuredHeight + 4 : measuredHeight,
      }).catch(() => {});
    };
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [columns, maxVisibleAccounts, startIndex, vertical]);

  const isMenuOpenRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unlistenClosed: (() => void) | undefined;
    void listen("taskbar-menu-closed", () => {
      isMenuOpenRef.current = false;
    })
      .then((u) => {
        if (cancelled) u();
        else unlistenClosed = u;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlistenClosed?.();
    };
  }, []);

  // Bumped by every leave: a hover whose position lookup is still pending must not show its
  // card after the pointer has already left, or nothing is left to hide it again.
  const hoverSeqRef = useRef(0);

  const hideTooltip = () => {
    hoverSeqRef.current += 1;
    if (!isMenuOpenRef.current) {
      void emit("overlay-tooltip-data", { visible: false }).catch(() => {});
    }
  };

  const resolvePanelAnchor = async (element: HTMLElement) => {
    const scale = getNativeScale();
    const dpr = window.devicePixelRatio || scale;
    const rect = element.getBoundingClientRect();
    const stripRect = stripRef.current?.getBoundingClientRect() ?? rect;
    const win = getCurrentWebviewWindow();
    const [pos, outerSize] = await Promise.all([
      win.outerPosition(),
      win.outerSize().catch(() => null),
    ]);
    return computeTaskbarPanelAnchor(edge, pos, stripRect, rect, dpr, outerSize);
  };

  // The tooltip window sizes itself to the hover card and sits adjacent to the strip edge.
  const showTooltip = (column: Column, element: HTMLElement) => {
    if (isMenuOpenRef.current) return;
    const hoverSeq = ++hoverSeqRef.current;
    resolvePanelAnchor(element)
      .then(({ placement, anchorX, anchorY }) => {
        if (hoverSeq !== hoverSeqRef.current || isMenuOpenRef.current) return;
        void emit("overlay-tooltip-data", {
          text: taskbarTooltipText(column),
          details: column.details,
          placement,
          x: anchorX,
          y: anchorY,
          cardCenterX: anchorX,
          anchorY,
          visible: true,
        });
      })
      .catch(() => {});
  };

  const showMenu = (column: Column, element: HTMLElement) => {
    hoverSeqRef.current += 1;
    isMenuOpenRef.current = true;
    resolvePanelAnchor(element)
      .then(({ placement, anchorX, anchorY }) => {
        void emit("overlay-tooltip-data", {
          menu: true,
          provider: column.provider,
          accountId: column.accountId,
          placement,
          x: anchorX,
          y: anchorY,
          cardCenterX: anchorX,
          anchorY,
          visible: true,
        });
      })
      .catch(() => {});
  };

  const openDashboard = (tab?: string, accountId?: string | null) => {
    isMenuOpenRef.current = false;
    void emit("overlay-tooltip-data", { visible: false }).catch(() => {});
    if (tab) {
      void emit(FOCUS_ACCOUNT_CARD_EVENT, { provider: tab, accountId }).catch(() => {});
    }
    invoke("show_dashboard", tab ? { tab } : {}).catch(() => {});
  };

  return (
    <div
      className={`taskbar-root taskbar-root--${data?.provider ?? "empty"}`}
      data-overlay-theme={overlayTheme}
      data-theme={appTheme}
      data-taskbar-edge={edge}
    >
      <div
        ref={stripRef}
        className="taskbar-strip"
        data-columns={columns.length}
        data-visible-columns={visibleColumns.length}
        onWheel={handleWheel}
      >
        {hasPrev && (
          <TaskbarNavArrow
            direction={vertical ? "up" : "left"}
            onClick={() => setStartIndex((prev) => Math.max(0, prev - 1))}
          />
        )}
        {visibleColumns.length ? (
          visibleColumns.map((column) => (
            <TaskbarColumn
              key={column.key}
              column={column}
              vertical={vertical}
              onHover={showTooltip}
              onLeave={hideTooltip}
              onMenu={showMenu}
              onOpen={(target) => openDashboard(target.provider, target.accountId)}
            />
          ))
        ) : (
          <button
            type="button"
            className="taskbar-empty"
            onClick={() => openDashboard()}
            data-tooltip="Open QuotaShift"
          >
            QuotaShift
          </button>
        )}
        {hasNext && (
          <TaskbarNavArrow
            direction={vertical ? "down" : "right"}
            onClick={() =>
              setStartIndex((prev) => Math.min(columns.length - maxVisibleAccounts, prev + 1))
            }
          />
        )}
      </div>
    </div>
  );
};
