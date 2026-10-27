import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
export const Toast = ({ toast, onDismiss }) => {
    useEffect(() => {
        if (!toast)
            return;
        const timer = window.setTimeout(() => onDismiss(), toast.durationMs);
        return () => window.clearTimeout(timer);
    }, [toast?.id]);
    if (!toast)
        return null;
    return (_jsxs("div", { className: `app-toast app-toast--${toast.kind}`, role: "status", "aria-live": toast.kind === "error" ? "assertive" : "polite", children: [_jsx("span", { className: "app-toast__message", children: toast.message }), _jsx("button", { type: "button", className: "app-toast__close", onClick: onDismiss, "data-tooltip": "Dismiss notification", "aria-label": "Dismiss notification", children: "\u00D7" })] }));
};
