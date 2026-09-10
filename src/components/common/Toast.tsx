import React, { useEffect } from "react";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastMessage {
  id: number;
  message: string;
  kind: ToastKind;
  durationMs: number;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => onDismiss(), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [toast?.id]);

  if (!toast) return null;

  return (
    <div
      className={`app-toast app-toast--${toast.kind}`}
      role="status"
      aria-live={toast.kind === "error" ? "assertive" : "polite"}
    >
      <span className="app-toast__message">{toast.message}</span>
      <button
        type="button"
        className="app-toast__close"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
};
