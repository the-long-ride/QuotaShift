import { useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  loadMainWindowZoomPercent,
  nextMainWindowZoomPercent,
  normalizeMainWindowZoomPercent,
  saveMainWindowZoomPercent,
} from "../../utils/common/main-window-zoom";

export const useMainWindowZoom = (): void => {
  const currentRef = useRef(loadMainWindowZoomPercent());

  useEffect(() => {
    let wheelFrame: number | null = null;
    let wheelDirection: -1 | 1 | null = null;
    const webview = getCurrentWebview();

    const apply = async (percent: number) => {
      const next = normalizeMainWindowZoomPercent(percent);
      currentRef.current = next;
      saveMainWindowZoomPercent(next);
      await webview.setZoom(next / 100).catch(() => {});
    };

    void apply(currentRef.current);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      const key = event.key;
      let direction: -1 | 0 | 1 | null = null;
      if (key === "=" || key === "+") direction = 1;
      else if (key === "-") direction = -1;
      else if (key === "0") direction = 0;
      if (direction === null) return;
      event.preventDefault();
      void apply(nextMainWindowZoomPercent(currentRef.current, direction));
    };

    const flushWheel = () => {
      wheelFrame = null;
      const direction = wheelDirection;
      wheelDirection = null;
      if (direction !== null) void apply(nextMainWindowZoomPercent(currentRef.current, direction));
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      wheelDirection = event.deltaY < 0 ? 1 : -1;
      if (wheelFrame === null) wheelFrame = window.requestAnimationFrame(flushWheel);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
      if (wheelFrame !== null) window.cancelAnimationFrame(wheelFrame);
    };
  }, []);
};
