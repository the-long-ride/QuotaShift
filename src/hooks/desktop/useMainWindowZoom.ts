import { useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  loadMainWindowZoomPercent,
  nextMainWindowZoomPercent,
  normalizeMainWindowZoomPercent,
  saveMainWindowZoomPercent,
} from "../../utils/common/ui/main-window-zoom";

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

    const onShortcutZoom = (event: Event) => {
      const direction = (event as CustomEvent<-1 | 0 | 1>).detail;
      if (direction !== -1 && direction !== 0 && direction !== 1) return;
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

    window.addEventListener("quotashift:zoom", onShortcutZoom);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("quotashift:zoom", onShortcutZoom);
      window.removeEventListener("wheel", onWheel);
      if (wheelFrame !== null) window.cancelAnimationFrame(wheelFrame);
    };
  }, []);
};
