import React, { useMemo, useState } from "react";
import { deobfuscate } from "../../utils/auth/auth";
import { AntigravityAccount, AntigravityUsageCacheEntry, FullStatus, LocalAntigravitySession } from "../../utils/common/types";
import { formatLastUsed } from "../../utils/account/account-last-used";
import { aggregateCloudQuotasIntoPools } from "../../utils/antigravity/antigravity-quota";
import { resolveAntigravityPlanName } from "../../App";
import { canAddLocalSessionToMonitored, createEmptyLocalAntigravitySession } from "../../utils/antigravity/local-antigravity-session";
import { computeAntigravityTierSummary } from "../../utils/antigravity/antigravity-tier-summary";
import { AntigravityQuotaRows } from "./AntigravityQuotaRows";
import { AntigravityAccountActions } from "./AntigravityAccountActions";
import { MonitoredHeartbeatIcon } from "../common/MonitoredHeartbeatIcon";
import { CardDragHandle } from "../common/CardDragHandle";
import { usePointerCardReorder } from "../../hooks/usePointerCardReorder";
import { useAccountRename } from "../../hooks/useAccountRename";

interface AntigravityTabProps {
  accounts: AntigravityAccount[];
  activeId: string | null;
  appliedId: string | null;
  trackedAccountId?: string | null;
  trackedProvider?: "antigravity" | "codex" | "claude";
  lastFullStatus: FullStatus | null;
  localSession?: Partial<LocalAntigravitySession> | null;
  antigravityUsageCache: Record<string, AntigravityUsageCacheEntry>;
  onApply: (acc: AntigravityAccount) => Promise<void>;
  onDelete: (acc: AntigravityAccount) => Promise<void>;
  onRename: (acc: AntigravityAccount, newLabel: string) => void;
  onTrack: (acc: AntigravityAccount) => void;
  onRefreshQuota: (acc: AntigravityAccount) => void;
  onSwitchBest: () => void;
  onReorder: (orderedIds: string[]) => void;
  onAddAccountClick: () => void;
  onAddLocalSessionToMonitored: () => void;
}

// Missing quota windows fallback constants: "Unavailable" / "Not available"
export const AntigravityTab: React.FC<AntigravityTabProps> = ({
  accounts, activeId, appliedId, trackedAccountId, trackedProvider = "antigravity",
  lastFullStatus, localSession: rawLocalSession, antigravityUsageCache, onApply, onDelete, onRename,
  onTrack, onRefreshQuota, onSwitchBest, onReorder, onAddAccountClick, onAddLocalSessionToMonitored,
}) => {
  const localSession: LocalAntigravitySession = { ...createEmptyLocalAntigravitySession(), ...rawLocalSession, quotas: rawLocalSession?.quotas || [] };
  const {
    editingId,
    editingValue,
    setEditingValue,
    handleStartRename,
    handleRenameSave,
    handleRenameKeyDown,
  } = useAccountRename(onRename);

  const {
    draggingId,
    containerRef: sortableContainerRef,
    controllerRef: reorderControllerRef,
    displayedItems: displayedAccounts,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = usePointerCardReorder(accounts, onReorder);

  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);

  const handleCopyEmail = async (id: string, email: string, targetEl?: HTMLElement) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmailId(id);
      if (targetEl) {
        window.dispatchEvent(
          new CustomEvent("show-tooltip", {
            detail: { target: targetEl, text: "Copied" },
          })
        );
      }
      setTimeout(() => {
        setCopiedEmailId((curr) => (curr === id ? null : curr));
      }, 1500);
    } catch (err) {
      console.error("Failed to copy email:", err);
    }
  };

  const handleCardClick = () => {
    if (reorderControllerRef.current.consumeClickSuppression()) return;
    // Single click does nothing; double-click marks as tracked
  };

  const handleCardDoubleClick = (account: AntigravityAccount) => {
    onTrack(account);
  };

  const tierSummary = useMemo(
    () => computeAntigravityTierSummary(accounts, antigravityUsageCache),
    [accounts, antigravityUsageCache]
  );

  return (
    <div className="tab-panel tab-panel--active">
      <div className="account-bar">
        <div className="account-bar-summary">
          <span className="account-bar-total" data-tooltip="Total Antigravity accounts">
            Total: <strong>{tierSummary.total}</strong>
          </span>
          {tierSummary.badges.length > 0 && (
            <div className="account-bar-badges">
              {tierSummary.badges.map(({ tier, count }) => (
                <span
                  key={tier}
                  className={`account-tier-badge account-tier-badge--${tier.toLowerCase()}`}
                  data-tooltip={`${count} ${tier} account${count > 1 ? "s" : ""}`}
                >
                  <span className="account-tier-badge-label">{tier}</span>
                  <span className="account-tier-badge-sep">-</span>
                  <span className="account-tier-badge-count">{count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="account-bar-actions">
          <button className="account-action-btn account-action-btn--add" onClick={onAddAccountClick} data-tooltip="Connect and add a new Antigravity account">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="10" height="10">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add Account
          </button>
          {accounts.length >= 2 && (
            <button
              className="account-action-btn"
              onClick={onSwitchBest}
              data-tooltip="Auto-switch to the Antigravity account with the highest remaining quota"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="10" height="10">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              Best
            </button>
          )}
        </div>
      </div>

      <div style={{ fontSize: "9px", color: "var(--text-secondary)", textAlign: "center", padding: "2px 10px 2px", opacity: 0.6 }}>
        Double-click a card to monitor in tray · Apply switches active session
      </div>

      <div className="app-content">
        <div className="codex-accounts-container" style={{ display: "flex", flexDirection: "column" }}>
          <div className="account-card local-session-card" style={{ cursor: "default", marginRight: "6px", marginBottom: "10px" }}>
            <div className="codex-card-header">
              <div className="codex-card-title-wrap" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                <div className={`local-session-status-dot ${localSession.online ? "local-session-status-dot--online" : ""}`} />
                <span className="codex-label-text" style={{ fontWeight: 700 }}>Local Antigravity Session</span>
                <span className={`local-session-state ${localSession.online ? "local-session-state--online" : ""}`}>
                  {localSession.online ? "Online" : localSession.lastSeenAt ? "Offline" : "Never captured"}
                </span>
              </div>
              <div className="codex-card-header-actions" style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                {canAddLocalSessionToMonitored(localSession, accounts) && (
                  <button className="card-apply-btn local-session-add-btn" onClick={onAddLocalSessionToMonitored} data-tooltip="Copy this protected local session into the monitored account list">
                    <svg viewBox="0 0 24 24" fill="none" width="11" height="11" aria-hidden="true">
                      <path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Add to monitored list
                  </button>
                )}
                <button className="card-apply-btn" onClick={onAddAccountClick} data-tooltip="Capture the currently signed-in local Antigravity profile">Capture</button>
              </div>
            </div>
            <div className="codex-card-info" style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginTop: "4px" }}>
              <div className="codex-card-plan-wrap" style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0, flex: 1 }}>
                <div className="codex-card-plan" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                  {resolveAntigravityPlanName(localSession.planTier) || "Local profile"}
                </div>
                {localSession.email && (
                  <>
                    <span style={{ color: "var(--text-secondary)", fontSize: "9px", flexShrink: 0, userSelect: "none" }}>·</span>
                    <span
                      className="codex-card-email-info"
                      data-tooltip={copiedEmailId === "local-session" ? "Copied" : "Click to copy email"}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleCopyEmail("local-session", localSession.email!, e.currentTarget); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); handleCopyEmail("local-session", localSession.email!, e.currentTarget); } }}
                      style={{ maxWidth: "100%", fontSize: "8.5px", color: "var(--codex-accent, #4ade80)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", minWidth: 0, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "2px" }}
                    >
                      {localSession.email}
                    </span>
                  </>
                )}
              </div>
              {!localSession.online && localSession.lastSeenAt && (
                <div className="codex-card-meta" style={{ flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8px" }}>
                  Last seen {new Date(localSession.lastSeenAt).toLocaleString()}
                </div>
              )}
            </div>
            <AntigravityQuotaRows quotas={localSession.quotas} />
          </div>

          {accounts.length === 0 && (
            <div className="codex-empty-state local-session-empty-monitored">
              <p className="codex-empty-title">No monitored Antigravity accounts</p>
              <p className="codex-empty-sub">Capture the local profile above or use Browser Login, then add it to the monitored list.</p>
            </div>
          )}

          <div ref={sortableContainerRef} className="monitored-account-list" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>

          {displayedAccounts.map((acc) => {
            const isSelected = acc.id === activeId;
            const effectiveTrackedId = trackedProvider === "antigravity"
              ? (trackedAccountId !== undefined ? trackedAccountId : (activeId && (!lastFullStatus || !lastFullStatus.monitoredCodex) ? activeId : null))
              : null;
            const isMonitoredAg = Boolean(effectiveTrackedId && acc.id === effectiveTrackedId);
            const cache = antigravityUsageCache[acc.id];
            const cachedCloudQuotas = cache?.cloudQuotas ? aggregateCloudQuotasIntoPools(cache.cloudQuotas) : [];
            const accountCloudQuotas = acc.cloudQuotas ? aggregateCloudQuotasIntoPools(acc.cloudQuotas) : [];
            const displayQuotas = cache?.accuracy === "exact_grouped"
              ? cachedCloudQuotas
              : cache?.quotas?.length ? cache.quotas
              : acc.quotas?.length ? acc.quotas
              : cachedCloudQuotas.length ? cachedCloudQuotas : accountCloudQuotas;
            const displayPlan = resolveAntigravityPlanName(cache?.planTier) || acc.lastPlan || "—";
            const displayBalance = cache?.credits
              ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cache.credits.balance)
              : acc.lastBalance || "—";
            let avatarUrl = "";
            if (acc.profileUrl) {
              try {
                const dec = deobfuscate(acc.profileUrl);
                if (dec && dec.startsWith("http")) avatarUrl = dec;
              } catch {}
            }

            return (
              <div
                key={acc.id}
                id={`ag-account-${acc.id}`}
                className={`account-card ${isSelected ? "account-card--active" : ""} ${isMonitoredAg ? "monitored" : ""} ${draggingId === acc.id ? "account-card--dragging" : ""}`}
                data-sortable-account-id={acc.id}
                style={{ cursor: "pointer" }}
                onClick={handleCardClick}
                onDoubleClick={() => handleCardDoubleClick(acc)}
              >
                <div className="codex-card-header">
                  <CardDragHandle
                    onPointerDown={(e) => handlePointerDown(e, acc.id)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                  />
                  <div className="codex-card-title-wrap" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                    {avatarUrl ? (
                      <img className="codex-card-avatar" src={avatarUrl} alt="Avatar" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="codex-card-avatar" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", fontWeight: "bold", background: "var(--border-color)", color: "var(--text-primary)" }}>
                        {acc.label ? acc.label.charAt(0).toUpperCase() : "A"}
                      </div>
                    )}

                    {isMonitoredAg && <MonitoredHeartbeatIcon />}

                    {editingId === acc.id ? (
                      <input
                        className="codex-label-input"
                        style={{ width: `${Math.max(4, editingValue.length) * 7.5}px`, maxWidth: "160px", minWidth: "30px" }}
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={() => handleRenameSave(acc)}
                        onKeyDown={(e) => handleRenameKeyDown(acc, e)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="codex-label-text"
                        onClick={(e) => handleStartRename(acc, e)}
                        data-tooltip="Click to rename this account label"
                        style={{ borderBottom: "1px dashed var(--border-color)", paddingBottom: "1px" }}
                      >
                        {acc.label}
                      </span>
                    )}
                  </div>
                  <AntigravityAccountActions
                    account={acc}
                    cache={cache}
                    isApplied={acc.id === appliedId}
                    onRefreshQuota={onRefreshQuota}
                    onApply={onApply}
                    onDelete={onDelete}
                  />
                </div>

                <div className="codex-card-info" style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginTop: "4px" }}>
                  <div className="codex-card-plan-wrap" style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0, flex: 1 }}>
                    <div className="codex-card-plan" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                      {displayPlan}
                    </div>
                    {acc.email && (
                      <>
                        <span style={{ color: "var(--text-secondary)", fontSize: "9px", flexShrink: 0, userSelect: "none" }}>·</span>
                        <span
                          className="codex-card-email-info"
                          data-tooltip={copiedEmailId === acc.id ? "Copied" : "Click to copy email"}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); handleCopyEmail(acc.id, acc.email!, e.currentTarget); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); handleCopyEmail(acc.id, acc.email!, e.currentTarget); } }}
                          style={{ maxWidth: "100%", fontSize: "8.5px", color: "var(--codex-accent, #4ade80)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", minWidth: 0, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "2px" }}
                        >
                          {acc.email}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="codex-card-meta-stack" style={{ flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8px" }}>
                    <div className="codex-card-meta">{displayBalance}</div>
                    {formatLastUsed(acc.lastUsedAt) ? (
                      <div className="account-last-used">{formatLastUsed(acc.lastUsedAt)}</div>
                    ) : null}
                  </div>
                </div>
                {cache?.error && (
                  <div className="antigravity-exact-error" data-tooltip={cache.error}>⚠ {cache.error}</div>
                )}
                <AntigravityQuotaRows quotas={displayQuotas} />
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
};
