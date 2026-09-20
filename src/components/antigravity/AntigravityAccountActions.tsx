import React from "react";
import type { AntigravityAccount, AntigravityUsageCacheEntry } from "../../utils/common/types";
import { isAccountReauthenticationError } from "../../utils/account/account-auth-error";
import { isAccountPollingSuspended } from "../../utils/account/account-poll-suspension";
import { ReauthenticateAccountButton } from "../common/ReauthenticateAccountButton";
import { TrackCurrentAccountIcon } from "../common/TrackCurrentAccountIcon";
import { ApplyAccountIcon } from "../common/ApplyAccountIcon";
import {
  AntigravityCloudApiIcon,
  AntigravityWorkerSandboxIcon,
  AntigravityIdeIcon,
} from "./AntigravityIcons";
import { CompactRefreshIcon } from "../common/CompactRefreshIcon";

interface AntigravityAccountActionsProps {
  account: AntigravityAccount;
  cache?: AntigravityUsageCacheEntry;
  isApplied: boolean;
  onRefreshQuota: (acc: AntigravityAccount) => void;
  onReauthenticate: () => void;
  onApply: (acc: AntigravityAccount) => Promise<void>;
  onDelete: (acc: AntigravityAccount) => Promise<void>;
}

function getAntigravitySourceBadge(
  cache: AntigravityUsageCacheEntry | undefined,
  isApplied: boolean,
) {
  if (cache?.loading) {
    const isWorker = cache.source === "exact" || cache.source === "cached_exact";
    const isIde = cache.source === "ide_local" || (isApplied && !cache.source);
    return {
      className: `antigravity-exact-source antigravity-exact-source--${cache.source || "idle"} antigravity-exact-source--loading`,
      tooltip: cache.workerMessage || "Refreshing quota…",
      icon: isWorker ? (
        <AntigravityWorkerSandboxIcon size={12} />
      ) : isIde ? (
        <AntigravityIdeIcon size={12} />
      ) : (
        <AntigravityCloudApiIcon size={12} />
      ),
    };
  }

  if (cache?.source === "exact" || cache?.source === "cached_exact") {
    const isCached = cache.source === "cached_exact";
    const method = isCached ? "Background worker sandbox (Cached)" : "Background worker sandbox";
    return {
      className: `antigravity-exact-source antigravity-exact-source--${cache.source}`,
      tooltip: `Usage was fetched from ${method}`,
      icon: <AntigravityWorkerSandboxIcon size={12} />,
    };
  }

  if (cache?.source === "cloud" || cache?.source === "cloud_fallback") {
    const isFallback = cache.source === "cloud_fallback";
    const method = isFallback ? "Cloud API (Fallback)" : "Cloud API";
    return {
      className: `antigravity-exact-source antigravity-exact-source--${cache.source}`,
      tooltip: `Usage was fetched from ${method}`,
      icon: <AntigravityCloudApiIcon size={12} />,
    };
  }

  if (cache?.source === "ide_local" || isApplied) {
    return {
      className: "antigravity-exact-source antigravity-exact-source--ide_local",
      tooltip: "Usage was fetched from Antigravity IDE / Antigravity 2.0",
      icon: <AntigravityIdeIcon size={12} />,
    };
  }

  return {
    className: "antigravity-exact-source antigravity-exact-source--idle",
    tooltip: "Not refreshed (Cloud API)",
    icon: <AntigravityCloudApiIcon size={12} />,
  };
}

export const AntigravityAccountActions: React.FC<AntigravityAccountActionsProps> = ({
  account,
  cache,
  isApplied,
  onRefreshQuota,
  onReauthenticate,
  onApply,
  onDelete,
}) => {
  const showReauthenticate =
    isAccountPollingSuspended("antigravity", account.id) ||
    isAccountReauthenticationError(cache?.error);
  const sourceBadge = getAntigravitySourceBadge(cache, isApplied);

  return (
    <div
      className="codex-card-header-actions"
      style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}
    >
      <span
        className={sourceBadge.className}
        data-tooltip={sourceBadge.tooltip}
        aria-label={sourceBadge.tooltip}
        role="img"
      >
        {sourceBadge.icon}
      </span>
      {cache?.lastExactFetchedAt && cache.source !== "exact" && (
        <span className="antigravity-exact-stale">
          Last exact {new Date(cache.lastExactFetchedAt).toLocaleString()}
        </span>
      )}
      {showReauthenticate && <ReauthenticateAccountButton onReauthenticate={onReauthenticate} />}
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
        <CompactRefreshIcon />
      </button>
      {!isApplied ? (
        <button
          type="button"
          className="card-apply-btn"
          onClick={(e) => {
            e.stopPropagation();
            onApply(account);
          }}
          data-tooltip="Set this account as the active workspace account"
          aria-label="Set this account as the active workspace account"
        >
          <ApplyAccountIcon />
        </button>
      ) : (
        <span
          className="card-active-badge"
          data-tooltip="This is currently active account at this device"
          aria-label="This is currently active account at this device"
          role="img"
        >
          <TrackCurrentAccountIcon size={12} gradient />
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
