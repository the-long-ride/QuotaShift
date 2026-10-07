import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { zoomCompensation } from "../../utils/common/webview-zoom";

let nativeScale: number | null = null;

/** Monitor scale of this window; the page's devicePixelRatio also includes any leaked page zoom. */
export const getNativeScale = (): number => nativeScale ?? (window.devicePixelRatio || 1);

/**
 * Keeps a native-sized window (taskbar strip, hover card) at its intended size when the main
 * window's page zoom leaks into it: the content root is scaled back via `.native-zoom-fix`.
 */
export const useNativeZoomCompensation = (): void => {
  useEffect(() => {
    const win = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const apply = () => {
      const factor = zoomCompensation(window.devicePixelRatio, nativeScale ?? 0);
      document.documentElement.style.setProperty("--native-zoom", String(factor));
      document.body.classList.toggle("native-zoom-fix", factor !== 1);
    };
    const refresh = () =>
      win
        .scaleFactor()
        .then((scale) => {
          if (disposed) return;
          nativeScale = scale;
          apply();
        })
        .catch(() => {});

    void refresh();
    window.addEventListener("resize", apply);
    win
      .onScaleChanged(() => void refresh())
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      window.removeEventListener("resize", apply);
      unlisten?.();
    };
  }, []);
};
