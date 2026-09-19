import { Component, ErrorInfo, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export function logFrontend(level: LogLevel, tag: string, message: string, data?: unknown) {
  let fullMessage = message;
  if (data !== undefined) {
    try {
      if (typeof data === "string") {
        fullMessage += ` | ${data}`;
      } else if (data instanceof Error) {
        fullMessage += ` | Error: ${data.message}\nStack: ${data.stack}`;
      } else {
        fullMessage += ` | Data: ${JSON.stringify(data)}`;
      }
    } catch {
      fullMessage += ` | Data: [Unstringifiable]`;
    }
  }

  // Also log to browser console
  if (level === "ERROR") {
    console.error(`[${tag}]`, message, data);
  } else if (level === "WARN") {
    console.warn(`[${tag}]`, message, data);
  } else {
    console.log(`[${tag}]`, message, data);
  }

  // Forward to Rust backend
  invoke("log_from_frontend", {
    level,
    tag,
    message: fullMessage,
  }).catch((err) => {
    console.error("[logger] Failed to invoke log_from_frontend:", err);
  });
}

// Global error handlers
export function initFrontendLogging() {
  logFrontend("INFO", "frontend:init", "Frontend logger initialized");

  window.addEventListener("error", (event) => {
    logFrontend(
      "ERROR",
      "window.onerror",
      `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
      event.error?.stack || event.error,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
    logFrontend("ERROR", "unhandledrejection", `Unhandled Promise rejection: ${msg}`, reason);
  });
}

// Error Boundary
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidMount() {
    const meta = import.meta as unknown as {
      hot?: { on: (event: string, cb: () => void) => void };
      env?: { DEV?: boolean };
    };
    if (meta.hot) {
      meta.hot.on("vite:beforeUpdate", () => {
        if (this.state.hasError) {
          this.setState({ hasError: false, error: null, errorInfo: null });
        }
      });
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    logFrontend(
      "ERROR",
      "ErrorBoundary",
      `React ErrorBoundary caught error: ${error.message}`,
      errorInfo.componentStack,
    );

    const meta = import.meta as unknown as { env?: { DEV?: boolean } };
    if (meta.env?.DEV) {
      const msg = error.message || "";
      const isHmrHookMismatch =
        msg.includes("Should have a queue") ||
        msg.includes("Rendered more hooks") ||
        msg.includes("Rendered fewer hooks") ||
        msg.includes("invalid-hook-call");

      if (isHmrHookMismatch) {
        const lastReload = Number(sessionStorage.getItem("__hmr_hook_reload__") || "0");
        const now = Date.now();
        if (now - lastReload > 3000) {
          sessionStorage.setItem("__hmr_hook_reload__", String(now));
          console.warn(
            "[ErrorBoundary] HMR hook mismatch detected after code edit. Auto-reloading cleanly...",
          );
          window.location.reload();
        }
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#111111",
            color: "#ffffff",
            padding: "24px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            fontFamily: "Inter, sans-serif",
            overflow: "auto",
            border: "1px solid #ef4444",
            borderRadius: "6px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>⚠️</span>
            <h2 style={{ fontSize: "16px", margin: 0, color: "#ef4444" }}>
              QuotaShift Dashboard Render Error
            </h2>
          </div>
          <p style={{ fontSize: "13px", color: "#a1a1aa", margin: 0 }}>
            An error occurred while rendering the dashboard. Details have been logged to the
            terminal and ~/.quotashift/quotashift.log.
          </p>
          <pre
            style={{
              background: "#1c1c1e",
              color: "#f87171",
              padding: "12px",
              borderRadius: "4px",
              fontSize: "12px",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              border: "1px solid #27272a",
            }}
          >
            {this.state.error?.toString()}
            {"\n\n"}
            {this.state.errorInfo?.componentStack}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            data-tooltip="Reload dashboard"
            style={{
              padding: "8px 16px",
              background: "#27272a",
              color: "#ffffff",
              border: "1px solid #3f3f46",
              borderRadius: "4px",
              cursor: "pointer",
              alignSelf: "flex-start",
              fontSize: "13px",
            }}
          >
            Reload Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
