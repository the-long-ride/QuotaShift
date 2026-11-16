import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { APP_THEME_EVENT, THEME_KEY } from "../../utils/common/backup/app-constants";
import {
  UI_ADJUSTMENT_EVENT,
  UI_ADJUSTMENT_STORAGE_KEY,
  loadUiAdjustmentPreferences,
  type OverlayTheme,
  type UiAdjustmentPreferences,
} from "../../utils/common/ui/ui-adjustment";
import type { OverlayAccountData } from "../../utils/common/overlay-types";
import {
  normalizeTaskbarEdge,
  type TaskbarEdge,
} from "../../utils/common/ui/taskbar-panel-placement";

const OVERLAY_DATA_KEY = "quotashift_overlay_data";

const readInitialData = (): OverlayAccountData | null => {
  try {
    const raw = localStorage.getItem(OVERLAY_DATA_KEY);
    return raw ? (JSON.parse(raw) as OverlayAccountData) : null;
  } catch {
    return null;
  }
};

/** Syncs overlay quota payload, app/overlay themes, and docked taskbar edge for the strip window. */
export function useTaskbarWindowSync() {
  const [data, setData] = useState<OverlayAccountData | null>(readInitialData);
  const [overlayTheme, setOverlayTheme] = useState<OverlayTheme>(
    () => loadUiAdjustmentPreferences().overlayTheme,
  );
  const [appTheme, setAppTheme] = useState<"light" | "dark">(() =>
    (localStorage.getItem(THEME_KEY) || "dark") === "light" ? "light" : "dark",
  );
  const [edge, setEdge] = useState<TaskbarEdge>("bottom");

  useEffect(() => {
    const applyAppTheme = (theme?: string | null) => {
      const next = theme === "light" ? "light" : "dark";
      setAppTheme(next);
      document.documentElement.setAttribute("data-theme", next);
    };

    const applyTheme = (theme?: OverlayTheme) => {
      const next = theme === "mono" ? "mono" : "glassmorphism";
      setOverlayTheme(next);
      document.documentElement.setAttribute("data-overlay-theme", next);
    };

    applyAppTheme(localStorage.getItem(THEME_KEY));
    applyTheme(loadUiAdjustmentPreferences().overlayTheme);

    let unlistenData: (() => void) | undefined;
    let unlistenUi: (() => void) | undefined;
    let unlistenTheme: (() => void) | undefined;
    let unlistenEdge: (() => void) | undefined;

    void invoke<string>("get_taskbar_edge")
      .then((initialEdge) => setEdge(normalizeTaskbarEdge(initialEdge)))
      .catch(() => {});

    void listen<string>("taskbar-edge-changed", (event) => {
      setEdge(normalizeTaskbarEdge(event.payload));
    }).then((u) => {
      unlistenEdge = u;
    });

    void listen<OverlayAccountData>("overlay-data-update", (event) => setData(event.payload)).then(
      (u) => {
        unlistenData = u;
      },
    );

    void listen<UiAdjustmentPreferences & { appTheme?: string }>(UI_ADJUSTMENT_EVENT, (event) => {
      if (event.payload?.appTheme) applyAppTheme(event.payload.appTheme);
      if (event.payload?.overlayTheme) applyTheme(event.payload.overlayTheme);
    }).then((u) => {
      unlistenUi = u;
    });

    void listen<string>(APP_THEME_EVENT, (event) => {
      applyAppTheme(event.payload);
    }).then((u) => {
      unlistenTheme = u;
    });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === UI_ADJUSTMENT_STORAGE_KEY) {
        applyTheme(loadUiAdjustmentPreferences().overlayTheme);
      }
      if (event.key === THEME_KEY) applyAppTheme(event.newValue);
    };
    window.addEventListener("storage", handleStorage);

    void getCurrentWebviewWindow()
      .setFocusable(false)
      .catch(() => {});

    return () => {
      unlistenData?.();
      unlistenUi?.();
      unlistenTheme?.();
      unlistenEdge?.();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return { data, overlayTheme, appTheme, edge };
}
