import React from "react";
import { AntigravityAccount } from "../../utils/common/types";
import { formatCompactTierName } from "../../utils/common/card-layout-mode";
import { canAddLocalSessionToMonitored } from "../../utils/antigravity/local-antigravity-session";
import { AntigravityQuotaRows } from "./AntigravityQuotaRows";
import { useLocalAntigravitySession } from "./useLocalAntigravitySession";
import { AntigravityIdeIcon } from "./AntigravityIcons";
import { CompactRefreshIcon } from "../common/CompactRefreshIcon";

interface AntigravityLocalSessionCardProps {
  session: ReturnType<typeof useLocalAntigravitySession>;
  accounts: AntigravityAccount[];
  copiedEmailTooltip: string;
  onRefreshQuota: (acc: AntigravityAccount) => void;
  onAddLocalSessionToMonitored: () => void;
  onAddAccountClick: () => void;
  onCopyEmail: (id: string, email: string, targetEl?: HTMLElement) => void;
}

export const AntigravityLocalSessionCard: React.FC<AntigravityLocalSessionCardProps> = ({
  session,
  accounts,
  copiedEmailTooltip,
  onRefreshQuota,
  onAddLocalSessionToMonitored,
  onAddAccountClick,
  onCopyEmail,
}) => {
  const {
    localSession,
    isLocalSessionActive,
    localDisplayPlan,
    localDisplayQuotas,
    matchedLocalAccount,
    localCache,
  } = session;

  return (
    <div className="account-card local-session-card" style={{ cursor: "default" }}>
      <div className="codex-card-header">
        <div
          className="codex-card-title-wrap"
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "6px" }}
        >
          <div
            className={`local-session-status-dot ${isLocalSessionActive ? "local-session-status-dot--online" : ""}`}
            data-tooltip={isLocalSessionActive ? "Local session active" : "Local session offline"}
          />
          <span className="codex-label-text" style={{ fontWeight: 700 }}>
            Local Antigravity Session
          </span>
          {localSession.email && (
            <span className="codex-card-header-email" data-tooltip={localSession.email}>
              {localSession.email}
            </span>
          )}
          {localDisplayPlan && (
            <span className="codex-card-tier-badge">{formatCompactTierName(localDisplayPlan)}</span>
          )}
        </div>
        <div
          className="codex-card-header-actions"
          style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}
        >
          <span
            className="antigravity-exact-source antigravity-exact-source--ide_local"
            data-tooltip="Usage was fetched from Antigravity IDE / Antigravity 2.0"
            aria-label="Usage was fetched from Antigravity IDE / Antigravity 2.0"
            role="img"
          >
            <AntigravityIdeIcon size={12} />
          </span>
          {matchedLocalAccount && (
            <button
              type="button"
              className={`codex-card-refresh-btn${localCache?.loading ? " spinning" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onRefreshQuota(matchedLocalAccount);
              }}
              disabled={localCache?.loading}
              data-tooltip="Refresh quota for this local session"
              aria-label="Refresh quota for local session"
            >
              <CompactRefreshIcon />
            </button>
          )}
          {canAddLocalSessionToMonitored(localSession, accounts) && (
            <button
              className="card-apply-btn local-session-add-btn"
              onClick={onAddLocalSessionToMonitored}
              data-tooltip="Copy this protected local session into the monitored account list"
            >
              <svg viewBox="0 0 24 24" fill="none" width="11" height="11" aria-hidden="true">
                <path
                  d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Add to monitored list
            </button>
          )}
          <button
            type="button"
            className="card-apply-btn local-session-capture-btn"
            onClick={onAddAccountClick}
            data-tooltip="Capture the currently signed-in local Antigravity profile"
            aria-label="Capture the currently signed-in local Antigravity profile"
          >
            <svg
              className="local-session-capture-icon"
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M3,9A1,1,0,0,0,4,8V5A1,1,0,0,1,5,4H8A1,1,0,0,0,8,2H5A3,3,0,0,0,2,5V8A1,1,0,0,0,3,9ZM8,20H5a1,1,0,0,1-1-1V16a1,1,0,0,0-2,0v3a3,3,0,0,0,3,3H8a1,1,0,0,0,0-2ZM12,8a4,4,0,1,0,4,4A4,4,0,0,0,12,8Zm0,6a2,2,0,1,1,2-2A2,2,0,0,1,12,14ZM19,2H16a1,1,0,0,0,0,2h3a1,1,0,0,1,1,1V8a1,1,0,0,0,2,0V5A3,3,0,0,0,19,2Zm2,13a1,1,0,0,0-1,1v3a1,1,0,0,1-1,1H16a1,1,0,0,0,0,2h3a3,3,0,0,0,3-3V16A1,1,0,0,0,21,15Z" />
            </svg>
          </button>
        </div>
      </div>
      <div
        className="codex-card-info"
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "10px",
          marginTop: "4px",
        }}
      >
        <div
          className="codex-card-plan-wrap account-card-email-tier-row"
          style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0, flex: 1 }}
        >
          <span className="account-card-plan-badge">{formatCompactTierName(localDisplayPlan)}</span>
          {localSession.email && (
            <span
              className="codex-card-email-info"
              data-tooltip={copiedEmailTooltip}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onCopyEmail("local-session", localSession.email!, e.currentTarget);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onCopyEmail("local-session", localSession.email!, e.currentTarget);
                }
              }}
              style={{
                maxWidth: "100%",
                fontSize: "8.5px",
                color: "var(--codex-accent, #4ade80)",
                textOverflow: "ellipsis",
                overflow: "hidden",
                whiteSpace: "nowrap",
                minWidth: 0,
                cursor: "pointer",
                textDecoration: "underline",
                textDecorationStyle: "dotted",
                textUnderlineOffset: "2px",
              }}
            >
              {localSession.email}
            </span>
          )}
        </div>
        {!isLocalSessionActive && localSession.lastSeenAt && (
          <div
            className="codex-card-meta"
            style={{ flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8px" }}
          >
            Last seen {new Date(localSession.lastSeenAt).toLocaleString()}
          </div>
        )}
      </div>
      <AntigravityQuotaRows quotas={localDisplayQuotas} />
    </div>
  );
};
