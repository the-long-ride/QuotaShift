import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CustomDialog } from "./CustomDialog";
import { QuitIcon } from "./HeaderIcons";

export function QuitButton({ shortcut }: { shortcut?: string }) {
  const [quitOpen, setQuitOpen] = useState(false);

  useEffect(() => {
    const requestQuit = () => setQuitOpen(true);
    window.addEventListener("quotashift-request-quit", requestQuit);
    return () => window.removeEventListener("quotashift-request-quit", requestQuit);
  }, []);

  return (
    <>
      <button
        type="button"
        className="quit-app-btn"
        data-tooltip="Quit QuotaShift"
        data-shortcut={shortcut}
        aria-label="Quit QuotaShift"
        onClick={() => setQuitOpen(true)}
      >
        <QuitIcon />
      </button>
      {quitOpen && (
        <CustomDialog
          title="Quit QuotaShift"
          message="Quit QuotaShift completely? Background monitoring and tray services will stop."
          isConfirm
          confirmText="Quit"
          cancelText="Cancel"
          confirmVariant="danger"
          onClose={(confirmed) => {
            setQuitOpen(false);
            if (confirmed) void invoke("quit_app");
          }}
        />
      )}
    </>
  );
}
