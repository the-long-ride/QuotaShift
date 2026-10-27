import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CopySvgIcon } from "../common/CopySvgIcon";
import { CliCheckIcon } from "../common/CliPoolIcons";
import { LogClearIcon, LogErrorsIcon } from "./CodexRouterServerIcons";

type LogFilter = "all" | "errors";

const LOG_LIMIT = 200;

const isProblemLine = (line: string) => line.includes("[WARN]") || line.includes("[ERROR]");

/** Live tail of router lines from the session log; never contains the router key. */
export const CodexRouterServerLogs: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let lastRevision = -1;
    const poll = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const revision = await invoke<number>("get_session_logs_revision");
        if (revision === lastRevision) return;
        lastRevision = revision;
        const next = await invoke<string[]>("get_codex_router_logs", { limit: LOG_LIMIT });
        if (!cancelled) setLogs(next);
      } catch {
        // Logs are best effort; the next tick retries.
      }
    };
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const visibleLogs = logFilter === "errors" ? logs.filter(isProblemLine) : logs;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visibleLogs.length, logFilter]);

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(visibleLogs.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.warn("Failed to copy router logs", error);
    }
  };

  const clearLogs = async () => {
    try {
      await invoke("clear_codex_router_logs");
    } catch (error) {
      console.warn("Failed to clear router logs", error);
    }
    setLogs([]);
  };

  return (
    <>
      <div className="qs-router-server-logs-head">
        <span className="qs-router-server-label">Server logs</span>
        <div className="qs-router-server-row">
          <button
            type="button"
            data-tooltip="Show all router logs"
            aria-label="All logs"
            aria-pressed={logFilter === "all"}
            className={`qs-router-server-btn ${logFilter === "all" ? "qs-router-server-btn--active" : ""}`}
            onClick={() => setLogFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            data-tooltip="Show error logs only"
            aria-label="Error logs"
            aria-pressed={logFilter === "errors"}
            className={`qs-router-server-btn qs-router-server-btn--icon ${logFilter === "errors" ? "qs-router-server-btn--active" : ""}`}
            onClick={() => setLogFilter("errors")}
          >
            <LogErrorsIcon size={12} />
          </button>
          <button
            type="button"
            data-tooltip={copied ? "Copied!" : "Copy visible logs"}
            aria-label="Copy logs"
            className="qs-router-server-btn qs-router-server-btn--icon"
            disabled={visibleLogs.length === 0}
            onClick={() => void copyLogs()}
          >
            {copied ? <CliCheckIcon size={12} /> : <CopySvgIcon size={12} />}
          </button>
          <button
            type="button"
            data-tooltip="Clear router logs"
            aria-label="Clear logs"
            className="qs-router-server-btn qs-router-server-btn--icon"
            disabled={logs.length === 0}
            onClick={() => void clearLogs()}
          >
            <LogClearIcon size={12} />
          </button>
        </div>
      </div>
      <div className="qs-router-server-logs" ref={logRef} role="log" aria-live="polite">
        {visibleLogs.length === 0 ? (
          <div className="qs-router-server-logs-empty">
            {logFilter === "errors" ? "No warnings or errors." : "No router activity yet."}
          </div>
        ) : (
          visibleLogs.map((line, index) => (
            <div
              key={`${index}-${line}`}
              className={`qs-router-server-log ${isProblemLine(line) ? "qs-router-server-log--problem" : ""}`}
            >
              {line}
            </div>
          ))
        )}
      </div>
    </>
  );
};
