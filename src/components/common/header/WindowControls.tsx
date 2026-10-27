import React, { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

const Icon: React.FC<{ kind: "min" | "max" | "restore" | "close" }> = ({ kind }) => {
  if (kind === "min")
    return (
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M5 12h14" />
      </svg>
    );
  if (kind === "restore")
    return (
      <svg
        viewBox="0 0 24 24"
        width="11"
        height="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="7" y="5" width="12" height="12" rx="1" />
        <path d="M5 8H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" />
      </svg>
    );
  if (kind === "max")
    return (
      <svg
        viewBox="0 0 24 24"
        width="11"
        height="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="4" y="4" width="16" height="16" rx="1" />
      </svg>
    );
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
};

export const WindowControls: React.FC = () => {
  const [maximized, setMaximized] = useState(false);
  const win = getCurrentWebviewWindow();

  const applyMaximizedState = (value: boolean) => {
    setMaximized(value);
    document.documentElement.setAttribute("data-window-maximized", value ? "true" : "false");
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const refresh = () => {
      void win
        .isMaximized()
        .then(applyMaximizedState)
        .catch(() => {});
    };
    refresh();
    void win.onResized(refresh).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const toggleMaximize = async () => {
    try {
      await win.toggleMaximize();
      applyMaximizedState(await win.isMaximized());
    } catch {}
  };

  return (
    <div className="window-controls" aria-label="Window controls">
      <button
        type="button"
        className="window-control-btn"
        data-tooltip="Minimize"
        aria-label="Minimize"
        onClick={() => void win.minimize()}
      >
        <Icon kind="min" />
      </button>
      <button
        type="button"
        className="window-control-btn"
        data-tooltip={maximized ? "Restore" : "Maximize"}
        aria-label={maximized ? "Restore" : "Maximize"}
        onClick={() => void toggleMaximize()}
      >
        <Icon kind={maximized ? "restore" : "max"} />
      </button>
      <button
        type="button"
        className="window-control-btn window-control-btn--close"
        data-tooltip="Close to tray"
        aria-label="Close to tray"
        onClick={() => void win.hide()}
      >
        <Icon kind="close" />
      </button>
    </div>
  );
};
