import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
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
import type { TaskbarTooltipDetails } from "../../utils/common/taskbar-columns";

export interface OverlayTooltipPayload {
  text: string;
  placement: "above" | "below";
  x: number;
  y: number;
  cardCenterX?: number;
  source?: "menu";
  /** Taskbar hover card: rendered as a multi-line card instead of one text line. */
  details?: TaskbarTooltipDetails;
  /** Physical y of the taskbar strip top; the card is placed just above it. */
  anchorY?: number;
  visible: boolean;
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

  // The taskbar card is measured after render, then the window is sized and placed to fit it.
  useLayoutEffect(() => {
    const card = detailsRef.current;
    if (!data?.visible || !data.details || !card) return;
    void placeTaskbarTooltip(
      getCurrentWebviewWindow(),
      card,
      data.cardCenterX ?? data.x,
      data.anchorY ?? data.y,
    ).catch((err) =>
      logFrontend("WARN", "tooltip:taskbar", `Failed to place taskbar tooltip: ${String(err)}`),
    );
  }, [data]);

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

    const applyScale = async (prefs?: UiAdjustmentPreferences) => {
      const p = normalizeUiAdjustmentPreferences(prefs || loadUiAdjustmentPreferences());
      const scale = (p.overlayScale || 100) / 100;
      document.documentElement.style.setProperty("--overlay-ui-scale", String(scale));
      document.documentElement.setAttribute("data-overlay-theme", p.overlayTheme);
      setOverlayTheme(p.overlayTheme);
      try {
        await win.setSize(new LogicalSize(Math.round(340 * scale), Math.round(38 * scale)));
      } catch (err) {
        logFrontend("WARN", "tooltip:scale", `Failed to set tooltip window size: ${String(err)}`);
      }
    };

    applyAppTheme(localStorage.getItem(THEME_KEY));
    void applyScale();

    listen<UiAdjustmentPreferences & { appTheme?: string }>(UI_ADJUSTMENT_EVENT, (event) => {
      if (event.payload?.appTheme) applyAppTheme(event.payload.appTheme);
      void applyScale(event.payload);
    })
      .then((u) => {
        unlistenUi = u;
      })
      .catch(() => {});

    listen<string>(APP_THEME_EVENT, (event) => {
      applyAppTheme(event.payload);
    })
      .then((u) => {
        unlistenTheme = u;
      })
      .catch(() => {});

    const handleStorage = (event: StorageEvent) => {
      if (event.key === UI_ADJUSTMENT_STORAGE_KEY) {
        void applyScale();
      }
      if (event.key === THEME_KEY) applyAppTheme(event.newValue);
    };
    window.addEventListener("storage", handleStorage);

    listen<OverlayTooltipPayload>("overlay-tooltip-data", async (event) => {
      const payload = event.payload;
      try {
        if (payload?.visible && payload.details) {
          setData(payload);
          return;
        }
        if (payload?.visible && payload?.text) {
          setData(payload);
          await applyScale();
          const outerSize = await win.outerSize().catch(() => null);
          const targetX =
            typeof payload.cardCenterX === "number" && outerSize
              ? Math.round(payload.cardCenterX - outerSize.width / 2)
              : payload.x;
          await win.setPosition(new PhysicalPosition(targetX, payload.y));
          await win.show();
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
      .then((u) => {
        unlistenData = u;
      })
      .catch(() => {});

    return () => {
      if (unlistenData) unlistenData();
      if (unlistenUi) unlistenUi();
      if (unlistenTheme) unlistenTheme();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  if (data?.visible && data.details) {
    return (
      <div className="taskbar-tooltip-root">
        <TaskbarTooltipCard ref={detailsRef} details={data.details} />
      </div>
    );
  }
  if (!data?.visible || !data?.text) return null;

  return (
    <div className="overlay-tooltip-root" data-overlay-theme={overlayTheme} data-theme={appTheme}>
      <div
        className={`overlay-tooltip overlay-tooltip--${data.placement}${data.source === "menu" ? " overlay-tooltip--menu" : ""}`}
        role="tooltip"
      >
        <span className="overlay-tooltip-text">{data.text}</span>
      </div>
    </div>
  );
};
