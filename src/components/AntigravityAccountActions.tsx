import React from "react";
import type { AntigravityAccount, AntigravityUsageCacheEntry } from "../utils/types";

interface AntigravityAccountActionsProps {
  account: AntigravityAccount;
  cache?: AntigravityUsageCacheEntry;
  isApplied: boolean;
  onRefreshQuota: (acc: AntigravityAccount) => void;
  onApply: (acc: AntigravityAccount) => Promise<void>;
  onDelete: (acc: AntigravityAccount) => Promise<void>;
}

export const AntigravityAccountActions: React.FC<AntigravityAccountActionsProps> = ({
  account,
  cache,
  isApplied,
  onRefreshQuota,
  onApply,
  onDelete,
}) => {
  return (
    <div
      className="codex-card-header-actions"
      style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}
    >
      <span
        className={`antigravity-exact-source antigravity-exact-source--${cache?.source || "idle"}`}
      >
        {cache?.loading
          ? cache.workerMessage || "Refreshing quota…"
          : cache?.source === "exact"
            ? "Exact local worker"
            : cache?.source === "cached_exact"
              ? "Cached exact"
              : cache?.source === "cloud_fallback"
                ? "Cloud fallback"
                : cache?.source === "cloud"
                  ? cache.accuracy === "exact_grouped"
                    ? "Cloud summary"
                    : "Cloud estimate"
                  : "Not refreshed"}
      </span>
      {cache?.lastExactFetchedAt && cache.source !== "exact" && (
        <span className="antigravity-exact-stale">
          Last exact {new Date(cache.lastExactFetchedAt).toLocaleString()}
        </span>
      )}
      <button
        className="antigravity-exact-refresh"
        onClick={(event) => {
          event.stopPropagation();
          onRefreshQuota(account);
        }}
        disabled={cache?.loading}
        data-tooltip="Launch this account's isolated Antigravity profile and read exact five-hour and weekly quota"
      >
        {cache?.loading ? "Working…" : "Refresh exact"}
      </button>
      {cache?.loading && (
        <div
          className="codex-spinner"
          style={{
            width: "8px",
            height: "8px",
            borderWidth: "1.5px",
            flexShrink: 0,
          }}
        />
      )}
      {!isApplied ? (
        <button
          className="card-apply-btn"
          onClick={(e) => {
            e.stopPropagation();
            onApply(account);
          }}
          data-tooltip="Set this account as the active workspace account"
        >
          Apply
        </button>
      ) : (
        <span className="card-active-badge">
          <span className="card-active-dot" />
          Active
        </span>
      )}
      <button
        className="codex-card-delete-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(account);
        }}
        data-tooltip="Remove this account from QuotaShift"
      >
        ×
      </button>
    </div>
  );
};
