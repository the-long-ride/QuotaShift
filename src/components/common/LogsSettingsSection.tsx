import React, { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CopySvgIcon } from "./CopySvgIcon";
import { OpenLocationSvgIcon, RemoveLogsSvgIcon } from "./LogIcons";
import { CustomDialog } from "./CustomDialog";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const LogsSettingsSection: React.FC = () => {
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const [sessionLogs, setSessionLogs] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const lastRevisionRef = useRef<number>(-1);
  const lastSizeRef = useRef<number>(-1);

  const fetchFileSize = async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const size = await invoke<number>("get_log_file_size");
      if (size !== lastSizeRef.current) {
        lastSizeRef.current = size;
        setFileSizeBytes(size);
      }
    } catch {
      setFileSizeBytes(0);
    }
  };

  const fetchSessionLogs = async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      let rev = -1;
      try {
        rev = await invoke<number>("get_session_logs_revision");
      } catch {}
      if (rev !== -1 && rev === lastRevisionRef.current) return;
      lastRevisionRef.current = rev;
      const logs = await invoke<string[]>("get_session_logs");
      setSessionLogs(logs);
    } catch {
      // Ignore fetch errors during window blur
    }
  };

  useEffect(() => {
    void fetchFileSize();
    void fetchSessionLogs();

    const timer = setInterval(() => {
      void fetchFileSize();
      void fetchSessionLogs();
    }, 1500);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [sessionLogs, autoScroll]);

  const handleClearLogs = async () => {
    setClearing(true);
    try {
      await invoke("clear_log_file");
      setFileSizeBytes(0);
    } catch (err) {
      console.error("Failed to clear log file:", err);
    } finally {
      setClearing(false);
    }
  };

  const handleOpenLogLocation = async () => {
    try {
      await invoke("open_logs_folder");
    } catch (err) {
      console.error("Failed to open logs folder:", err);
    }
  };

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(sessionLogs.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy logs:", err);
    }
  };

  return (
    <div className="settings-section logs-settings-section">
      <div className="settings-section-title">Logs</div>

      {/* Persistent File Controls */}
      <div className="logs-file-controls-card">
        <div className="logs-file-info">
          <span className="logs-file-label">Persistent log file</span>
          <span className="logs-file-desc">
            Warnings &amp; errors only - Size:{" "}
            <strong>{fileSizeBytes !== null ? formatBytes(fileSizeBytes) : "..."}</strong>
          </span>
        </div>
        <div className="logs-file-actions">
          <button
            type="button"
            className="logs-action-button"
            onClick={handleOpenLogLocation}
            data-tooltip="Open log file location"
            aria-label="Open log file location"
          >
            <OpenLocationSvgIcon size={14} />
          </button>
          <button
            type="button"
            className="logs-action-button logs-action-button--danger"
            onClick={() => setConfirmDialogOpen(true)}
            disabled={clearing || fileSizeBytes === 0}
            data-tooltip="Remove logs"
            aria-label="Remove logs"
          >
            <RemoveLogsSvgIcon size={14} />
          </button>
        </div>
      </div>

      {confirmDialogOpen && (
        <CustomDialog
          title="Remove Logs"
          message="Are you sure you want to remove all logs in quotashift.log? This cannot be undone."
          isConfirm
          confirmText="Remove Logs"
          cancelText="Cancel"
          confirmVariant="danger"
          onClose={(confirmed) => {
            setConfirmDialogOpen(false);
            if (confirmed) {
              void handleClearLogs();
            }
          }}
        />
      )}

      {/* Session Logs Header & Viewer */}
      <div className="logs-session-header">
        <div className="logs-session-title-group">
          <span className="logs-session-title">Session Logs</span>
          <span className="logs-session-subtitle">
            Includes all debug and info logs from app start until stop. Starts fresh on next launch.
          </span>
        </div>
        <div className="logs-session-tools">
          <div className="logs-autoscroll-control">
            <button
              type="button"
              role="switch"
              aria-checked={autoScroll}
              aria-label="Toggle auto-scroll"
              data-tooltip="Toggle auto-scroll"
              className={`codex-pool-switch ${autoScroll ? "codex-pool-switch--on" : ""}`}
              onClick={() => setAutoScroll((v) => !v)}
            >
              <span className="codex-pool-switch-thumb" />
            </button>
            <span className="logs-autoscroll-label">Auto-scroll</span>
          </div>
          <button
            type="button"
            className="logs-copy-button"
            onClick={handleCopyLogs}
            data-tooltip={copied ? "Copied!" : "Copy all logs below"}
            aria-label="Copy all logs below"
          >
            <CopySvgIcon size={14} />
          </button>
        </div>
      </div>

      <div
        ref={logContainerRef}
        className="logs-terminal-viewer"
        role="region"
        aria-label="QuotaShift session logs"
      >
        {sessionLogs.length === 0 ? (
          <div className="logs-terminal-empty">No session logs recorded yet.</div>
        ) : (
          sessionLogs.map((line, idx) => (
            <div key={idx} className="logs-terminal-line">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
