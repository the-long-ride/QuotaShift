import React from "react";
import type { AntigravityAccount, AntigravityUsageCacheEntry } from "../../utils/common/types";

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
        type="button"
        className={`codex-card-refresh-btn${cache?.loading ? " spinning" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onRefreshQuota(account);
        }}
        disabled={cache?.loading}
        data-tooltip="Refresh quota for this account"
        aria-label={`Refresh quota for ${account.label || account.email || account.id}`}
      >
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
          <path d="M4 12a8 8 0 018-8 8 8 0 016.93 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M20 12a8 8 0 01-8 8 8 8 0 01-6.93-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18 4l2 4-4-.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 20l-2-4 4 .5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
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
