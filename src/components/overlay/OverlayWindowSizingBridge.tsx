import React, { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor } from "@tauri-apps/api/window";
import { APP_THEME_EVENT, THEME_KEY } from "../../utils/common/app-constants";
import {
  resolveMeasuredOverlaySize,
  resolveViewportAdjustedOverlaySize,
  type OverlayBox,
} from "../../utils/common/overlay-measure";
import {
  UI_ADJUSTMENT_EVENT,
  UI_ADJUSTMENT_STORAGE_KEY,
  getOverlayWindowHeight,
  getOverlayWindowWidth,
  loadUiAdjustmentPreferences,
  normalizeUiAdjustmentPreferences,
  type UiAdjustmentPreferences,
} from "../../utils/common/ui-adjustment";

const CARD_SELECTOR = ".overlay-container .glass-card";

export const OverlayWindowSizingBridge: React.FC = () => {
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    let preferences = loadUiAdjustmentPreferences();
    let resizeFrame: number | null = null;
    let lastApplied: { width: number; height: number } | null = null;
    let currentProvider: string | null = null;
    let observedCard: Element | null = null;

    const applyAppTheme = (theme?: string | null) => {
      document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    };

    try {
      const savedProvider = localStorage.getItem("quotashift_overlay_tracked_provider");
      if (savedProvider) {
        currentProvider = savedProvider;
      } else {
        const rawData = localStorage.getItem("quotashift_overlay_data");
        if (rawData) {
          const parsed = JSON.parse(rawData);
          if (parsed?.provider) currentProvider = parsed.provider;
        }
      }
    } catch {}

    const clampToWorkArea = async () => {
      const monitor = await currentMonitor();
      if (!monitor) return;
      const position = await win.outerPosition();
      const size = await win.outerSize();
      const workPosition = monitor.workArea?.position ?? monitor.position;
      const workSize = monitor.workArea?.size ?? monitor.size;
      const maxX = Math.max(workPosition.x, workPosition.x + workSize.width - size.width);
      const maxY = Math.max(workPosition.y, workPosition.y + workSize.height - size.height);
      const x = Math.max(workPosition.x, Math.min(maxX, position.x));
      const y = Math.max(workPosition.y, Math.min(maxY, position.y));
      if (x !== position.x || y !== position.y) await win.setPosition(new PhysicalPosition(x, y));
    };

    // The card is max-content in both axes, so its size never depends on the window size
    // and shrinking the window to it cannot feed back into another resize. Computed sizes
    // are unzoomed CSS px; client rects inside the zoomed container mix units.
    const measureOverlay = (fallback: OverlayBox): OverlayBox => {
      const card = document.querySelector<HTMLElement>(CARD_SELECTOR);
      if (!card) return fallback;
      const style = window.getComputedStyle(card);
      return resolveMeasuredOverlaySize({
        card: { width: parseFloat(style.width), height: parseFloat(style.height) },
        fallback,
        scale: preferences.overlayScale / 100,
      });
    };

    const resizeOverlay = async () => {
      const measured = measureOverlay({
        width: getOverlayWindowWidth(preferences, currentProvider),
        height: getOverlayWindowHeight(preferences, currentProvider),
      });
      const next = resolveViewportAdjustedOverlaySize({
        measured,
        applied: lastApplied,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
      if (lastApplied?.width === next.width && lastApplied?.height === next.height) return;
      await win.setSize(new LogicalSize(next.width, next.height));
      lastApplied = next;
      await clampToWorkArea();
    };

    const scheduleResize = () => {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        void resizeOverlay().catch(() => {});
      });
    };

    const cardObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => scheduleResize()) : null;
    const attachCard = () => {
      const card = document.querySelector(CARD_SELECTOR);
      if (card === observedCard) return;
      if (observedCard) cardObserver?.unobserve(observedCard);
      observedCard = card;
      if (card) cardObserver?.observe(card);
      scheduleResize();
    };
    const cardMountObserver = new MutationObserver(attachCard);
    cardMountObserver.observe(document.body, { childList: true, subtree: true });

    const apply = (nextPreferences: UiAdjustmentPreferences = preferences) => {
      preferences = normalizeUiAdjustmentPreferences(nextPreferences);
      document.documentElement.style.setProperty(
        "--overlay-ui-scale",
        String(preferences.overlayScale / 100),
      );
      document.documentElement.setAttribute("data-overlay-theme", preferences.overlayTheme);
      scheduleResize();
    };

    applyAppTheme(localStorage.getItem(THEME_KEY));
    apply();
    attachCard();
    let unlistenUi: (() => void) | null = null;
    let unlistenTheme: (() => void) | null = null;
    let unlistenData: (() => void) | null = null;
    let cancelled = false;
    void listen<UiAdjustmentPreferences & { appTheme?: string }>(UI_ADJUSTMENT_EVENT, (event) => {
      if (event.payload?.appTheme) applyAppTheme(event.payload.appTheme);
      apply(event.payload);
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenUi = unlisten;
    });
    void listen<string>(APP_THEME_EVENT, (event) => applyAppTheme(event.payload)).then(
      (unlisten) => {
        if (cancelled) unlisten();
        else unlistenTheme = unlisten;
      },
    );
    void listen<{ provider?: string }>("overlay-data-update", (event) => {
      if (event.payload?.provider && event.payload.provider !== currentProvider) {
        currentProvider = event.payload.provider;
        scheduleResize();
      }
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenData = unlisten;
    });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === UI_ADJUSTMENT_STORAGE_KEY) apply(loadUiAdjustmentPreferences());
      if (event.key === THEME_KEY) applyAppTheme(event.newValue);
      if (
        event.key === "quotashift_overlay_tracked_provider" &&
        event.newValue &&
        event.newValue !== currentProvider
      ) {
        currentProvider = event.newValue;
        scheduleResize();
      }
      if (event.key === "quotashift_overlay_data" && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (parsed?.provider && parsed.provider !== currentProvider) {
            currentProvider = parsed.provider;
            scheduleResize();
          }
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("resize", scheduleResize);

    return () => {
      cancelled = true;
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      cardMountObserver.disconnect();
      cardObserver?.disconnect();
      unlistenUi?.();
      unlistenTheme?.();
      unlistenData?.();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("resize", scheduleResize);
    };
  }, []);

  return null;
};
