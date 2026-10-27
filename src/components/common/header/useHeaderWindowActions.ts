import { useRef } from "react";
import type { Window } from "@tauri-apps/api/window";

export function useHeaderWindowActions(win: Window) {
  const lastToggleRef = useRef(0);

  const handleToggleMaximize = async () => {
    const now = Date.now();
    if (now - lastToggleRef.current < 300) return;
    lastToggleRef.current = now;
    try {
      await win.toggleMaximize();
      const isMax = await win.isMaximized();
      document.documentElement.setAttribute("data-window-maximized", isMax ? "true" : "false");
    } catch {}
  };

  const handleHeaderMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,textarea,a,[data-no-window-drag]")) return;
    if (event.detail === 2) {
      void handleToggleMaximize();
      return;
    }
    void win.startDragging().catch(() => {});
  };

  const handleHeaderDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,textarea,a,[data-no-window-drag]")) return;
    void handleToggleMaximize();
  };

  return { handleHeaderMouseDown, handleHeaderDoubleClick, handleToggleMaximize };
}
