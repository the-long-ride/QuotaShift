import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { TaskbarColumn } from "./TaskbarColumn";
import type { OverlayAccountData } from "../../utils/common/overlay-types";
import {
  buildTaskbarColumns,
  taskbarTooltipText,
  type TaskbarColumn as Column,
} from "../../utils/common/taskbar-columns";

const OVERLAY_DATA_KEY = "quotashift_overlay_data";
/** The taskbar strip (and its hover card) always uses the glass look, whatever the overlay theme. */
const TASKBAR_THEME = "glassmorphism";

const readInitialData = (): OverlayAccountData | null => {
  try {
    const raw = localStorage.getItem(OVERLAY_DATA_KEY);
    return raw ? (JSON.parse(raw) as OverlayAccountData) : null;
  } catch {
    return null;
  }
};

export const TaskbarApp: React.FC = () => {
  const [data, setData] = useState<OverlayAccountData | null>(readInitialData);
  const stripRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(() => buildTaskbarColumns(data), [data]);

  useEffect(() => {
    document.documentElement.setAttribute("data-overlay-theme", TASKBAR_THEME);
    const unlisten = listen<OverlayAccountData>("overlay-data-update", (event) =>
      setData(event.payload),
    );
    void getCurrentWebviewWindow()
      .setFocusable(false)
      .catch(() => {});
    return () => {
      void unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // The native strip is sized by Rust from this report (CSS px), so the content drives it.
  // `scrollWidth` is the full content width even while the window is still too narrow.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const report = () => {
      const rect = strip.getBoundingClientRect();
      invoke("set_taskbar_content_size", {
        width: Math.ceil(Math.max(strip.scrollWidth, rect.width)) + 2,
        height: Math.ceil(Math.max(strip.scrollHeight, rect.height)),
      }).catch(() => {});
    };
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [columns]);

  const hideTooltip = () => void emit("overlay-tooltip-data", { visible: false }).catch(() => {});

  // The tooltip window sizes itself to the hover card and sits just above the strip.
  const showTooltip = (column: Column, element: HTMLElement) => {
    const dpr = window.devicePixelRatio || 1;
    const rect = element.getBoundingClientRect();
    getCurrentWebviewWindow()
      .outerPosition()
      .then((pos) => {
        const cardCenterX = Math.round(pos.x + (rect.left + rect.width / 2) * dpr);
        void emit("overlay-tooltip-data", {
          text: taskbarTooltipText(column),
          details: column.details,
          placement: "above",
          x: cardCenterX,
          y: pos.y,
          cardCenterX,
          anchorY: pos.y,
          visible: true,
        });
      })
      .catch(() => {});
  };

  const openDashboard = (tab?: string) => {
    hideTooltip();
    invoke("show_dashboard", tab ? { tab } : {}).catch(() => {});
  };

  return (
    <div
      className={`taskbar-root taskbar-root--${data?.provider ?? "empty"}`}
      data-overlay-theme={TASKBAR_THEME}
    >
      <div ref={stripRef} className="taskbar-strip" data-columns={columns.length}>
        {columns.length ? (
          columns.map((column) => (
            <TaskbarColumn
              key={column.key}
              column={column}
              onHover={showTooltip}
              onLeave={hideTooltip}
              onOpen={(target) => openDashboard(target.provider)}
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
      </div>
    </div>
  );
};
