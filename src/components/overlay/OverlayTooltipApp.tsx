import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { APP_THEME_EVENT, THEME_KEY } from "../../utils/common/app-constants";
import {
  UI_ADJUSTMENT_EVENT,
  UI_ADJUSTMENT_STORAGE_KEY,
  loadUiAdjustmentPreferences,
  normalizeUiAdjustmentPreferences,
  type OverlayTheme,
  type UiAdjustmentPreferences,
} from "../../utils/common/ui-adjustment";
import { TaskbarTooltipCard, placeTaskbarTooltip } from "../taskbar/TaskbarTooltipCard";
import { TaskbarContextMenuView } from "../taskbar/TaskbarContextMenuView";
import { placeTextTooltip } from "./overlay-tooltip-placement";
import { useNativeZoomCompensation } from "../../hooks/desktop/useNativeZoomCompensation";
import type { TaskbarTooltipDetails } from "../../utils/common/taskbar-columns";

export interface OverlayTooltipPayload {
  text?: string;
  placement?: "above" | "below";
  x: number;
  y: number;
  cardCenterX?: number;
  /** Physical px width of the overlay card stack; a text tooltip never gets wider than this. */
  maxWidth?: number;
  source?: "menu";
  /** Taskbar hover card: rendered as a multi-line card instead of one text line. */
  details?: TaskbarTooltipDetails;
  /** Physical y of the taskbar strip top; the card is placed just above it. */
  anchorY?: number;
  visible: boolean;
  menu?: boolean;
  provider?: "antigravity" | "codex" | "claude";
  accountId?: string | null;
}

import { logFrontend } from "../../utils/common/logger";

export const OverlayTooltipApp: React.FC = () => {
  const [data, setData] = useState<OverlayTooltipPayload | null>(null);
  const [overlayTheme, setOverlayTheme] = useState<OverlayTheme>(
    () => loadUiAdjustmentPreferences().overlayTheme,
  );
  const [appTheme, setAppTheme] = useState<"light" | "dark">(() =>
    document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark",
  );
  const detailsRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useNativeZoomCompensation();

  // The taskbar card is measured after render, then the window is sized and placed to fit it.
  useLayoutEffect(() => {
    const card = detailsRef.current;
    if (!data?.visible || !data.details || !card) return;
    const update = () => {
      void placeTaskbarTooltip(
        getCurrentWebviewWindow(),
        card,
        data.cardCenterX ?? data.x,
        data.anchorY ?? data.y,
      ).catch((err) =>
        logFrontend("WARN", "tooltip:taskbar", `Failed to place taskbar tooltip: ${String(err)}`),
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(card);
    return () => observer.disconnect();
  }, [data]);

  const closeTaskbarMenu = useCallback(async () => {
    setData(null);
    const win = getCurrentWebviewWindow();
    await win.hide().catch(() => {});
    await win.setFocusable(false).catch(() => {});
    void emit("taskbar-menu-closed").catch(() => {});
  }, []);

  useEffect(() => {
    let unlistenData: (() => void) | undefined;
    let unlistenUi: (() => void) | undefined;
    let unlistenTheme: (() => void) | undefined;
    const win = getCurrentWebviewWindow();

    void win.setFocusable(false).catch((err) => {
      logFrontend("WARN", "tooltip:focus", `Failed to make tooltip non-focusable: ${String(err)}`);
    });

    const applyAppTheme = (theme?: string | null) => {
      const next = theme === "light" ? "light" : "dark";
      setAppTheme(next);
      document.documentElement.setAttribute("data-theme", next);
    };

    const applyScale = (prefs?: UiAdjustmentPreferences) => {
      const p = normalizeUiAdjustmentPreferences(prefs || loadUiAdjustmentPreferences());
      const scale = (p.overlayScale || 100) / 100;
      document.documentElement.style.setProperty("--overlay-ui-scale", String(scale));
      document.documentElement.setAttribute("data-overlay-theme", p.overlayTheme);
      setOverlayTheme(p.overlayTheme);
      // The window size is owned by the placement code (placeTextTooltip / the card and menu
      // placers). Resizing it here raced with them and could leave it at the wrong width.
      setData((prev) => (prev ? { ...prev } : prev));
    };

    // Every listener is released even when its subscription resolves after cleanup (React
    // StrictMode remounts the effect): a leaked listener ran each placement twice, concurrently.
    let disposed = false;
    const keep = (assign: (unlisten: () => void) => void) => (unlisten: () => void) => {
      if (disposed) unlisten();
      else assign(unlisten);
    };
    // Bumped by every tooltip event; a placement that is no longer the latest abandons itself.
    let eventSeq = 0;

    applyAppTheme(localStorage.getItem(THEME_KEY));
    applyScale();

    listen<UiAdjustmentPreferences & { appTheme?: string }>(UI_ADJUSTMENT_EVENT, (event) => {
      if (event.payload?.appTheme) applyAppTheme(event.payload.appTheme);
      applyScale(event.payload);
    })
      .then(
        keep((u) => {
          unlistenUi = u;
        }),
      )
      .catch(() => {});

    listen<string>(APP_THEME_EVENT, (event) => {
      applyAppTheme(event.payload);
    })
      .then(
        keep((u) => {
          unlistenTheme = u;
        }),
      )
      .catch(() => {});

    const handleStorage = (event: StorageEvent) => {
      if (event.key === UI_ADJUSTMENT_STORAGE_KEY) {
        applyScale();
      }
      if (event.key === THEME_KEY) applyAppTheme(event.newValue);
    };
    window.addEventListener("storage", handleStorage);

    listen<OverlayTooltipPayload>("overlay-tooltip-data", async (event) => {
      const payload = event.payload;
      const seq = ++eventSeq;
      try {
        if (payload?.visible && payload.menu) {
          const p = normalizeUiAdjustmentPreferences(loadUiAdjustmentPreferences());
          const scale = (p.overlayScale || 100) / 100;
          document.documentElement.style.setProperty("--overlay-ui-scale", String(scale));
          setData(payload);
          return;
        }
        if (payload?.visible && payload.details) {
          const p = normalizeUiAdjustmentPreferences(loadUiAdjustmentPreferences());
          const scale = (p.overlayScale || 100) / 100;
          document.documentElement.style.setProperty("--overlay-ui-scale", String(scale));
          setData(payload);
          return;
        }
        if (payload?.visible && payload?.text) {
          const p = normalizeUiAdjustmentPreferences(loadUiAdjustmentPreferences());
          dataRef.current = payload;
          applyScale();
          setData(payload);
          await placeTextTooltip(
            win,
            payload,
            (p.overlayScale || 100) / 100,
            () => textRef.current,
            () => !disposed && seq === eventSeq,
          );
        } else {
          setData(null);
          await win.hide();
        }
      } catch (err) {
        logFrontend(
          "ERROR",
          "tooltip:window",
          `OverlayTooltip window setPosition/show failed: ${String(err)}`,
        );
      }
    })
      .then(
        keep((u) => {
          unlistenData = u;
        }),
      )
      .catch(() => {});

    return () => {
      disposed = true;
      if (unlistenData) unlistenData();
      if (unlistenUi) unlistenUi();
      if (unlistenTheme) unlistenTheme();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  if (data?.visible && data.menu) {
    return (
      <TaskbarContextMenuView
        data={data}
        appTheme={appTheme}
        overlayTheme={overlayTheme}
        setAppTheme={setAppTheme}
        onClose={() => void closeTaskbarMenu()}
      />
    );
  }

  if (data?.visible && data.details) {
    return (
      <div className="taskbar-tooltip-root" data-overlay-theme={overlayTheme} data-theme={appTheme}>
        <TaskbarTooltipCard ref={detailsRef} details={data.details} />
      </div>
    );
  }
  if (!data?.visible || !data?.text) return null;

  return (
    <div className="overlay-tooltip-root" data-overlay-theme={overlayTheme} data-theme={appTheme}>
      <div
        ref={textRef}
        className={`overlay-tooltip overlay-tooltip--${data.placement}${data.source === "menu" ? " overlay-tooltip--menu" : ""}`}
        role="tooltip"
      >
        <span className="overlay-tooltip-text">{data.text}</span>
      </div>
    </div>
  );
};
