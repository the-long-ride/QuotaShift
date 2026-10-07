import React, { useEffect, useLayoutEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { APP_THEME_EVENT, THEME_KEY } from "../../utils/common/app-constants";
import { OverlayContextMenu } from "../overlay/OverlayContextMenu";
import { placeTaskbarMenu } from "./TaskbarTooltipCard";
import { FOCUS_ACCOUNT_CARD_EVENT } from "../../utils/common/account-card-scroll";
import { saveDisplayMode } from "../../utils/common/display-mode";
import type { OverlayTooltipPayload } from "../overlay/OverlayTooltipApp";
import type { OverlayTheme } from "../../utils/common/ui-adjustment";
import { logFrontend } from "../../utils/common/logger";

export interface TaskbarContextMenuViewProps {
  data: OverlayTooltipPayload;
  appTheme: "light" | "dark";
  overlayTheme: OverlayTheme;
  setAppTheme: React.Dispatch<React.SetStateAction<"light" | "dark">>;
  onClose: () => void;
}

/**
 * Context menu displayed on top of the taskbar for an account column.
 * Handles sizing, positioning, blur dismiss, and action dispatches.
 */
export const TaskbarContextMenuView: React.FC<TaskbarContextMenuViewProps> = ({
  data,
  appTheme,
  overlayTheme,
  setAppTheme,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const menuEl = menuRef.current;
    if (!menuEl) return;
    void placeTaskbarMenu(
      getCurrentWebviewWindow(),
      menuEl,
      data.cardCenterX ?? data.x,
      data.anchorY ?? data.y,
    ).catch((err) =>
      logFrontend("WARN", "tooltip:menu", `Failed to place taskbar menu: ${String(err)}`),
    );
  }, [data.cardCenterX, data.x, data.anchorY, data.y]);

  // Native watcher: a click anywhere outside this window closes the menu even when blur never fires.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen("taskbar-menu-dismiss", () => onCloseRef.current()).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    void invoke("start_taskbar_menu_dismiss").catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
      void invoke("stop_taskbar_menu_dismiss").catch(() => {});
    };
  }, []);

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let isHovered = false;

    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const startIdleTimer = () => {
      clearIdleTimer();
      if (!isHovered) {
        idleTimer = setTimeout(() => {
          onClose();
        }, 5000);
      }
    };

    const handlePointerEnter = () => {
      isHovered = true;
      clearIdleTimer();
    };

    const handlePointerLeave = () => {
      isHovered = false;
      startIdleTimer();
    };

    const handleInteraction = () => {
      if (!isHovered) {
        startIdleTimer();
      }
    };

    const handlePointerMove = (e: PointerEvent | MouseEvent) => {
      const rootEl = rootRef.current;
      if (rootEl && e.target && rootEl.contains(e.target as Node)) {
        if (!isHovered) {
          isHovered = true;
          clearIdleTimer();
        }
      }
    };

    const handleBlur = () => {
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else handleInteraction();
    };
    const handleOutside = (e: MouseEvent | PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".overlay-context-menu")) {
        onClose();
      } else {
        handleInteraction();
      }
    };

    const root = rootRef.current;
    if (root?.matches?.(":hover")) {
      isHovered = true;
    } else {
      startIdleTimer();
    }

    root?.addEventListener("pointerenter", handlePointerEnter);
    root?.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("pointerdown", handleOutside);

    return () => {
      clearIdleTimer();
      root?.removeEventListener("pointerenter", handlePointerEnter);
      root?.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("pointerdown", handleOutside);
    };
  }, [onClose]);

  const handleRefreshUsage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.provider) {
      await emit("request-refresh-usage", {
        provider: data.provider,
        accountId: data.accountId,
      }).catch(() => {});
    }
    onClose();
  };

  const handleOpenDashboard = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.provider) {
      await emit(FOCUS_ACCOUNT_CARD_EVENT, {
        provider: data.provider,
        accountId: data.accountId,
      }).catch(() => {});
    }
    await invoke("show_dashboard", data.provider ? { tab: data.provider } : {}).catch(() => {});
    onClose();
  };

  const handleToggleTheme = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextTheme = appTheme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, nextTheme);
    setAppTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    void emit(APP_THEME_EVENT, nextTheme);
  };

  const handleUntrackAccount = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.provider && data.accountId) {
      await emit("request-untrack-account", {
        provider: data.provider,
        accountId: data.accountId,
      }).catch(() => {});
    }
    onClose();
  };

  const handleHideDisplay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    saveDisplayMode("none");
    await emit("overlay-visibility-changed", false).catch(() => {});
    await invoke("set_display_mode", { mode: "none" }).catch(() => {});
    onClose();
  };

  return (
    <div
      ref={rootRef}
      className="taskbar-menu-root"
      data-overlay-theme={overlayTheme}
      data-theme={appTheme}
    >
      <OverlayContextMenu
        isOpen={true}
        x={0}
        y={0}
        appTheme={appTheme}
        menuRef={menuRef}
        localTooltips={true}
        onClose={onClose}
        onRefreshUsage={handleRefreshUsage}
        onOpenDashboard={handleOpenDashboard}
        onToggleTheme={handleToggleTheme}
        onUntrackAccount={handleUntrackAccount}
        onHideOverlay={handleHideDisplay}
      />
    </div>
  );
};
