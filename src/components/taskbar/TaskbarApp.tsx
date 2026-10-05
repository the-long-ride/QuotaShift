import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { TaskbarColumn } from "./TaskbarColumn";
import { APP_THEME_EVENT, THEME_KEY } from "../../utils/common/app-constants";
import type { OverlayAccountData } from "../../utils/common/overlay-types";
import {
  buildTaskbarColumns,
  taskbarTooltipText,
  type TaskbarColumn as Column,
} from "../../utils/common/taskbar-columns";
import {
  UI_ADJUSTMENT_EVENT,
  loadUiAdjustmentPreferences,
  type OverlayTheme,
  type UiAdjustmentPreferences,
} from "../../utils/common/ui-adjustment";

const OVERLAY_DATA_KEY = "quotashift_overlay_data";

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
  const [overlayTheme, setOverlayTheme] = useState<OverlayTheme>(
    () => loadUiAdjustmentPreferences().overlayTheme,
  );
  const [appTheme, setAppTheme] = useState<"light" | "dark">(() =>
    localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark",
  );
  const stripRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(() => buildTaskbarColumns(data), [data]);

  useEffect(() => {
    const unlisteners: Array<Promise<() => void>> = [
      listen<OverlayAccountData>("overlay-data-update", (event) => setData(event.payload)),
      listen<UiAdjustmentPreferences & { appTheme?: string }>(UI_ADJUSTMENT_EVENT, (event) => {
        if (event.payload?.overlayTheme) setOverlayTheme(event.payload.overlayTheme);
        if (event.payload?.appTheme === "light" || event.payload?.appTheme === "dark")
          setAppTheme(event.payload.appTheme);
      }),
      listen<string>(APP_THEME_EVENT, (event) =>
        setAppTheme(event.payload === "light" ? "light" : "dark"),
      ),
    ];
    void getCurrentWebviewWindow()
      .setFocusable(false)
      .catch(() => {});
    return () => {
      unlisteners.forEach((p) => void p.then((unlisten) => unlisten()).catch(() => {}));
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-overlay-theme", overlayTheme);
    document.documentElement.setAttribute("data-theme", appTheme);
  }, [overlayTheme, appTheme]);

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

  const showTooltip = (column: Column, element: HTMLElement) => {
    const dpr = window.devicePixelRatio || 1;
    const uiScale = (loadUiAdjustmentPreferences().overlayScale || 100) / 100;
    const rect = element.getBoundingClientRect();
    getCurrentWebviewWindow()
      .outerPosition()
      .then((pos) => {
        const tooltipHeight = Math.round(38 * uiScale * dpr);
        const cardCenterX = Math.round(pos.x + (rect.left + rect.width / 2) * dpr);
        void emit("overlay-tooltip-data", {
          text: taskbarTooltipText(column),
          placement: "above",
          x: Math.round(cardCenterX - (340 * uiScale * dpr) / 2),
          y: Math.round(pos.y - tooltipHeight + 2 * dpr),
          cardCenterX,
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
      data-overlay-theme={overlayTheme}
      data-theme={appTheme}
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
