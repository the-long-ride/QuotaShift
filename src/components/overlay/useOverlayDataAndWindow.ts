import React, { useState, useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { OverlayAccountData } from "./OverlayApp";
import {
  clampPositionToScreen,
  isPositionOnActiveMonitor,
  getPrimaryMonitorBottomRight,
} from "./overlay-position";
import { availableMonitors } from "@tauri-apps/api/window";
import { STORAGE_OVERLAY_POS_KEY } from "./useOverlayDrag";

export const STORAGE_OVERLAY_DATA_KEY = "quotashift_overlay_data";

export function loadInitialOverlayData(): OverlayAccountData {
  try {
    const raw = localStorage.getItem(STORAGE_OVERLAY_DATA_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { provider: "antigravity", label: "Loading...", loading: true };
}

export function useOverlayDataAndWindow(
  lastWindowPosRef: React.MutableRefObject<{ x: number; y: number } | null>,
  updateMonitorBounds: () => Promise<void>,
) {
  const [data, setData] = useState<OverlayAccountData>(loadInitialOverlayData);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    const win = getCurrentWebviewWindow();
    const initPos = async () => {
      let posToUse: { x: number; y: number } | null = null;
      try {
        const savedPos = localStorage.getItem(STORAGE_OVERLAY_POS_KEY);
        if (savedPos) {
          const parsed = JSON.parse(savedPos);
          if (typeof parsed?.x === "number" && typeof parsed?.y === "number") posToUse = parsed;
        }
      } catch {}
      if (!posToUse) {
        try {
          const currentOuter = await win.outerPosition();
          posToUse = { x: currentOuter.x, y: currentOuter.y };
        } catch {}
      }
      if (posToUse) {
        lastWindowPosRef.current = posToUse;
        const clamped = await clampPositionToScreen(posToUse);
        if (clamped) {
          lastWindowPosRef.current = clamped;
          await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
          try {
            localStorage.setItem(STORAGE_OVERLAY_POS_KEY, JSON.stringify(clamped));
          } catch {}
        }
      }
      await updateMonitorBounds();
    };
    initPos();

    let unlistenMoved: (() => void) | undefined, saveTimeout: number | undefined;
    win
      .onMoved((pos) => {
        lastWindowPosRef.current = { x: pos.payload.x, y: pos.payload.y };
        window.clearTimeout(saveTimeout);
        saveTimeout = window.setTimeout(() => {
          try {
            localStorage.setItem(
              STORAGE_OVERLAY_POS_KEY,
              JSON.stringify({ x: pos.payload.x, y: pos.payload.y }),
            );
          } catch {}
        }, 150);
      })
      .then((u) => {
        unlistenMoved = u;
      })
      .catch(() => {});

    let unlistenData: (() => void) | undefined;
    listen<OverlayAccountData>("overlay-data-update", (event) => {
      if (event.payload) {
        setData(event.payload);
        try {
          localStorage.setItem(STORAGE_OVERLAY_DATA_KEY, JSON.stringify(event.payload));
        } catch {}
      }
    })
      .then((u) => {
        unlistenData = u;
      })
      .catch(() => {});

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_OVERLAY_DATA_KEY && e.newValue) {
        try {
          setData(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);

    let lastTopologyKey = "";
    const checkMonitorTopology = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const monitors = (await availableMonitors()) || [];
        if (monitors.length === 0) return;
        const topologyKey = monitors
          .map((m) => `${m.position.x},${m.position.y},${m.size.width},${m.size.height}`)
          .join(";");
        if (lastTopologyKey && topologyKey === lastTopologyKey) return;
        lastTopologyKey = topologyKey;

        const currentPos = lastWindowPosRef.current;
        if (!currentPos) return;
        const winSize = await win.outerSize();
        if (!isPositionOnActiveMonitor(currentPos, winSize, monitors)) {
          const resetPos = await getPrimaryMonitorBottomRight(winSize);
          if (resetPos) {
            lastWindowPosRef.current = resetPos;
            await win.setPosition(new PhysicalPosition(resetPos.x, resetPos.y));
            try {
              localStorage.setItem(STORAGE_OVERLAY_POS_KEY, JSON.stringify(resetPos));
            } catch {}
          }
        }
      } catch {}
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        lastTopologyKey = "";
        void checkMonitorTopology();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    void checkMonitorTopology();
    const monitorCheckInterval = window.setInterval(checkMonitorTopology, 10000);

    return () => {
      window.clearTimeout(saveTimeout);
      window.clearInterval(monitorCheckInterval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (unlistenMoved) unlistenMoved();
      if (unlistenData) unlistenData();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    setAvatarError(false);
  }, [data.avatarUrl]);

  return { data, setData, avatarError, setAvatarError };
}
