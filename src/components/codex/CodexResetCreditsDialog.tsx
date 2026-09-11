import React from "react";
import type { CodexAccount } from "../../utils/common/types";
import {
  CodexResetCreditsData,
  formatResetDatePair,
  formatResetTimeRemaining,
} from "../../utils/codex/codex-reset-credits";

interface CodexResetCreditsDialogProps {
  isOpen: boolean;
  account: CodexAccount | null;
  creditsData?: CodexResetCreditsData | null;
  isLoading?: boolean;
  onClose: () => void;
}

export const CodexResetCreditsDialog: React.FC<CodexResetCreditsDialogProps> = ({
  isOpen,
  account,
  creditsData: explicitCreditsData,
  isLoading = false,
  onClose,
}) => {
  if (!isOpen || !account) return null;

  const creditsData = explicitCreditsData ?? account.resetCredits ?? null;
  const availableCount = creditsData?.available_count ?? creditsData?.credits?.length ?? 0;
  const credits = creditsData?.credits || [];

  return (
    <div
      className="dialog-overlay"
      style={{ display: "flex" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dialog-box codex-model-dialog codex-reset-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Reset Credits for ${account.label}`}
        style={{ width: "320px", maxWidth: "90vw" }}
      >
        <div className="dialog-header codex-model-dialog-header">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "10.5px", fontWeight: 600 }}>Rate Limit Reset Credits</span>
            <span
              style={{
                fontSize: "8px",
                fontWeight: 600,
                color: availableCount > 0 ? "#10b981" : "var(--text-secondary)",
                background: availableCount > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(255, 255, 255, 0.05)",
                padding: "1px 5px",
                borderRadius: "10px",
                border: "1px solid " + (availableCount > 0 ? "rgba(16, 185, 129, 0.2)" : "var(--border-color)"),
              }}
            >
              {availableCount} Available
            </span>
          </div>
          <button
            className="codex-model-dialog-close"
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <div className="codex-model-dialog-body" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div className="codex-model-dialog-account" style={{ paddingBottom: "4px", borderBottom: "1px solid var(--border-color)" }}>
            <div className="codex-model-dialog-identity">
              <strong style={{ fontSize: "10px" }}>{account.label}</strong>
              <span style={{ fontSize: "8.5px", color: "var(--text-secondary)" }}>{account.email ?? "No email"}</span>
            </div>
            <div className="codex-model-dialog-meta">
              <span style={{ fontSize: "8.5px", color: "var(--text-primary)", fontWeight: 600, textTransform: "uppercase" }}>
                {(account.lastPlan ?? "Plan unknown").toUpperCase()}
              </span>
            </div>
          </div>

          {credits.length === 0 ? (
            <div style={{ padding: "12px 0", textAlign: "center", color: "var(--text-secondary)", fontSize: "9px" }}>
              {isLoading ? "Loading reset credits..." : "No reset credits reported for this account."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "240px", overflowY: "auto" }}>
              {credits.map((item, idx) => {
                const granted = formatResetDatePair(item.granted_at);
                const expires = formatResetDatePair(item.expires_at);
                const remain = formatResetTimeRemaining(item.expires_at);
                const isAvailable = (item.status || "available") === "available";

                return (
                  <div
                    key={item.id ?? idx}
                    style={{
                      background: "var(--bg-color, rgba(255, 255, 255, 0.02))",
                      border: "1px solid var(--border-color)",
                      borderRadius: "5px",
                      padding: "6px 8px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "3px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: "9.5px", color: "var(--text-primary)" }}>
                        {item.title || "Rate Limit Reset"}
                      </span>
                      <span
                        style={{
                          fontSize: "7.5px",
                          fontWeight: 600,
                          padding: "1px 5px",
                          borderRadius: "3px",
                          background: isAvailable ? "rgba(16, 185, 129, 0.12)" : "rgba(255, 255, 255, 0.05)",
                          color: isAvailable ? "#10b981" : "var(--text-secondary)",
                          border: "1px solid " + (isAvailable ? "rgba(16, 185, 129, 0.25)" : "var(--border-color)"),
                        }}
                      >
                        {remain && remain !== "N/A" ? remain : (item.status || "available")}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                        fontSize: "8px",
                        color: "var(--text-secondary)",
                        marginTop: "1px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>Expiry:</span>
                        <span style={{ color: "var(--text-primary)", textAlign: "right" }}>{expires.local}</span>
                      </div>
                      {granted.local && granted.local !== "N/A" && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>Granted:</span>
                          <span style={{ textAlign: "right" }}>{granted.local}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "2px" }}>
            <button
              className="card-apply-btn"
              type="button"
              onClick={onClose}
              style={{ margin: 0, padding: "3px 10px", fontSize: "8.5px" }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
