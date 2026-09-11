import React, { useMemo, useState, useRef, useEffect } from "react";
import { CodexAccount, CodexAccountPool, CodexModelCatalogCacheEntry, CodexRouterStatus, FullStatus } from "../../utils/common/types";
import { formatAbsoluteTime } from "../../utils/common/format-time"; import { formatLastUsed } from "../../utils/account/account-last-used";
import { formatCompactLimitLabel, formatCompactTierName } from "../../utils/common/card-layout-mode";
import { normalizeCodexUsageWindows } from "../../utils/codex/codex-usage-windows"; import { formatResetCreditsSummary, buildResetCreditsTooltip } from "../../utils/codex/codex-reset-credits";
import { CodexPoolCard } from "./CodexPoolCard"; import { CodexAvailableModelsDialog } from "./CodexAvailableModelsDialog"; import { CodexResetCreditsDialog } from "./CodexResetCreditsDialog";
import { computeCodexTierSummary } from "../../utils/codex/codex-tier-summary"; import { deobfuscate, decodeJwtProfile } from "../../utils/auth/auth";
import { useAccountRename } from "../../hooks/useAccountRename"; import { usePointerCardReorder } from "../../hooks/usePointerCardReorder";
import { CardDragHandle } from "../common/CardDragHandle"; import { MonitoredHeartbeatIcon } from "../common/MonitoredHeartbeatIcon";
import { CodexSpendBreakdown } from "./CodexSpendBreakdown"; import { CodexEmptyState } from "./CodexEmptyState";
import { filterAccountsByQuery } from "../../utils/account/account-search"; import { TrackCurrentAccountIcon } from "../common/TrackCurrentAccountIcon";

interface CodexTabProps {
  accounts: CodexAccount[]; pools?: CodexAccountPool[]; activePoolId?: string | null; activeId: string | null; appliedId: string | null;
  trackedAccountId?: string | null; trackedProvider?: "antigravity" | "codex" | "claude"; lastFullStatus: FullStatus | null;
  codexUsageCache: Record<string, any>; codexModelCache?: Record<string, CodexModelCatalogCacheEntry>;
  onRescanModels?: (account: CodexAccount) => void | Promise<void>; onApply: (acc: CodexAccount) => void; onDelete: (acc: CodexAccount) => void;
  onRename: (acc: CodexAccount, newLabel: string) => void; onTrack: (acc: CodexAccount) => void; onSelect?: (acc: CodexAccount) => void;
  onRefresh?: (acc: CodexAccount) => void | Promise<void>; onSwitchBest: () => void; onReorder: (orderedIds: string[]) => void;
  onAddAccountClick: () => void; onNewPool?: () => void; onEditPool?: (pool: CodexAccountPool) => void; onDeletePool?: (pool: CodexAccountPool) => void;
  onApplyPool?: (pool: CodexAccountPool) => void; poolRoutingEnabled?: boolean; poolRoutingBusy?: boolean; routerStatus?: CodexRouterStatus | null;
  onTogglePoolRouting?: () => void; onTrackCurrentAccount?: () => void | Promise<void>; isTrackingCurrentAccount?: boolean; searchQuery?: string;
}

export const CodexTab: React.FC<CodexTabProps> = ({
  accounts, pools = [], activePoolId = null, activeId, appliedId,
  trackedAccountId, trackedProvider = "antigravity", lastFullStatus,
  codexUsageCache, codexModelCache = {}, onRescanModels = () => {},
  onApply, onDelete, onRename, onTrack, onSelect: _onSelect = () => {},
  onRefresh = () => {}, onSwitchBest, onReorder, onAddAccountClick,
  onNewPool = () => {}, onEditPool = () => {}, onDeletePool = () => {},
  onApplyPool = () => {}, poolRoutingEnabled = false, poolRoutingBusy = false,
  routerStatus = null, onTogglePoolRouting = () => {},
  onTrackCurrentAccount, isTrackingCurrentAccount = false, searchQuery,
}) => {
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [availableModelsAccount, setAvailableModelsAccount] = useState<CodexAccount | null>(null);
  const [resetCreditsAccount, setResetCreditsAccount] = useState<CodexAccount | null>(null);
  const [codexSection, setCodexSection] = useState<"accounts" | "pools">("accounts");
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(new Set());
  const prevAvatarsRef = useRef<Record<string, string | undefined>>({});
  useEffect(() => {
    setFailedAvatarIds((prev) => {
      let changed = false; const next = new Set(prev);
      for (const a of accounts) {
        if (prevAvatarsRef.current[a.id] !== undefined && prevAvatarsRef.current[a.id] !== a.profileUrl && next.has(a.id)) { next.delete(a.id); changed = true; }
        prevAvatarsRef.current[a.id] = a.profileUrl;
      }
      return changed ? next : prev;
    });
  }, [accounts]);

  const { editingId, editingValue, setEditingValue, handleStartRename, handleRenameSave, handleRenameKeyDown } = useAccountRename(onRename);
  const isFiltered = Boolean((searchQuery || "").trim());
  const filteredAccounts = useMemo(() => filterAccountsByQuery(accounts, searchQuery), [accounts, searchQuery]);
  const { draggingId, containerRef: sortableContainerRef, controllerRef: reorderControllerRef, displayedItems: displayedAccounts, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = usePointerCardReorder(filteredAccounts, (ids) => { if (!isFiltered) onReorder(ids); });
  const currentAppliedId = useMemo(() => {
    return appliedId && accounts.some((a) => a.id === appliedId) ? appliedId : null;
  }, [accounts, appliedId]);

  const handleRefresh = async (e: React.MouseEvent, acc: CodexAccount) => {
    e.stopPropagation();
    if (refreshingIds.has(acc.id)) return;
    setRefreshingIds((prev) => new Set(prev).add(acc.id));
    try { await onRefresh(acc); } finally {
      setRefreshingIds((prev) => { const next = new Set(prev); next.delete(acc.id); return next; });
    }
  };

  const handleCopyEmail = async (id: string, email: string, targetEl?: HTMLElement) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmailId(id);
      if (targetEl) {
        window.dispatchEvent(new CustomEvent("show-tooltip", { detail: { target: targetEl, text: "Copied" } }));
      }
      setTimeout(() => setCopiedEmailId((curr) => (curr === id ? null : curr)), 1500);
    } catch (err) {
      console.error("Failed to copy email:", err);
    }
  };

  const handleCardClick = () => {
    if (reorderControllerRef.current.consumeClickSuppression()) return;
    // Single click does nothing; double-click marks as tracked
  };
  const handleCardDoubleClick = (account: CodexAccount) => { onTrack(account); };

  const tierSummary = useMemo(() => computeCodexTierSummary(filteredAccounts, codexUsageCache), [filteredAccounts, codexUsageCache]);

  return (
    <div className="tab-panel tab-panel--active">
      <div style={{ padding: "4px 10px 4px", background: "var(--card-bg)", borderBottom: "1px solid var(--border-color)", flexShrink: 0 }}>
        <div className="codex-subtabs" role="tablist" aria-label="Codex views">
          <button type="button" role="tab" aria-selected={codexSection === "accounts"} className={`codex-subtab ${codexSection === "accounts" ? "codex-subtab--active" : ""}`} onClick={() => setCodexSection("accounts")}>Accounts</button>
          <button type="button" role="tab" aria-selected={codexSection === "pools"} className={`codex-subtab ${codexSection === "pools" ? "codex-subtab--active" : ""}`} onClick={() => setCodexSection("pools")}>Pools</button>
        </div>
      </div>

      {codexSection === "accounts" && (
        <>
          <div className="account-bar">
            <div className="account-bar-summary">
              <span className="account-bar-total" data-tooltip="Total Codex accounts">
                Total: <strong>{tierSummary.total}</strong>
              </span>
              {tierSummary.badges.length > 0 && (
                <div className="account-bar-badges">
                  {tierSummary.badges.map(({ tier, count }) => (
                    <span key={tier} className={`account-tier-badge account-tier-badge--${tier.toLowerCase()}`} data-tooltip={`${count} ${tier} account${count > 1 ? "s" : ""}`}>
                      <span className="account-tier-badge-label">{tier}</span>
                      <span className="account-tier-badge-sep">-</span>
                      <span className="account-tier-badge-count">{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="account-bar-actions">
              <button className="account-action-btn account-action-btn--add" onClick={onAddAccountClick} data-tooltip="Connect and add a new Codex account">
                <svg viewBox="0 0 24 24" fill="none" width="10" height="10"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                Add Account
              </button>
              {onTrackCurrentAccount && (
                <button type="button" className="account-action-btn account-action-btn--icon-only" onClick={onTrackCurrentAccount} disabled={isTrackingCurrentAccount} aria-label="Track Current Account" data-tooltip="Track the account currently active in the local ChatGPT Codex session"><TrackCurrentAccountIcon /></button>
              )}
              {accounts.length >= 2 && (
                <button className="account-action-btn" onClick={onSwitchBest} data-tooltip="Auto-switch to the Codex account with the highest remaining quota">
                  <svg viewBox="0 0 24 24" fill="none" width="10" height="10"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
                  Best
                </button>
              )}
            </div>
          </div>

          <div style={{ fontSize: "9px", color: "var(--text-secondary)", textAlign: "center", padding: "2px 10px 2px", opacity: 0.6 }}>
            Double-click a card to monitor in tray · Apply switches active session
          </div>

          <div className="app-content">
            {accounts.length === 0 ? (
              <CodexEmptyState />
            ) : filteredAccounts.length === 0 ? (
              <div className="codex-empty-state" style={{ margin: "16px auto", textAlign: "center" }}>
                <p className="codex-empty-title">No matching accounts</p>
                <p className="codex-empty-sub">No accounts found matching "{searchQuery?.trim()}"</p>
              </div>
            ) : (
              <div ref={sortableContainerRef} className="codex-accounts-container" style={{ display: "flex", flexDirection: "column", cursor: draggingId ? "grabbing" : undefined }} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={handlePointerCancel}>
            {displayedAccounts.map((acc) => {
              const isSelected = acc.id === activeId;
              const effectiveTrackedId = trackedProvider === "codex" ? (trackedAccountId !== undefined ? trackedAccountId : (lastFullStatus?.monitoredCodex?.accountId ?? activeId)) : null;
              const isMonitored = Boolean(effectiveTrackedId && acc.id === effectiveTrackedId);
              const planText = (acc.lastPlan || "—").toUpperCase();
              const cache = codexUsageCache[acc.id];
              const resetCredits = cache?.resetCredits ?? (cache?.rate_limit as any)?.reset_credits ?? acc.resetCredits;
              const availableResets = resetCredits
                ? (resetCredits.available_count ?? resetCredits.credits?.length ?? 0)
                : (acc.lastResets ? (parseInt(acc.lastResets, 10) || 0) : 0);
              const resetsSummary = resetCredits ? formatResetCreditsSummary(resetCredits) : (acc.lastResets || "0 resets");
              const resetsTooltip = resetCredits ? buildResetCreditsTooltip(resetCredits) : undefined;
              const canOpenResets = availableResets > 0;

              let avatarUrl = "";
              if (acc.profileUrl) {
                try {
                  const dec = deobfuscate(acc.profileUrl);
                  if (dec && dec.startsWith("http")) avatarUrl = dec;
                } catch (e) { console.error("Avatar parse error:", e); }
              }
              if (!avatarUrl && acc.apiKey) {
                try {
                  const rawKey = deobfuscate(acc.apiKey);
                  if (rawKey.startsWith("{")) {
                    const profile = decodeJwtProfile(JSON.parse(rawKey).idToken);
                    if (profile?.picture && profile.picture.startsWith("http")) avatarUrl = profile.picture;
                  }
                } catch {}
              }

              return (
                <div key={acc.id} id={`codex-account-${acc.id}`} className={`account-card ${isSelected ? "account-card--active" : ""} ${isMonitored ? "monitored" : ""} ${draggingId === acc.id ? "account-card--dragging" : ""}`} data-sortable-account-id={acc.id} style={{ cursor: "pointer" }} onClick={handleCardClick} onDoubleClick={() => handleCardDoubleClick(acc)}>
                  <div className="codex-card-header">
                    <CardDragHandle onPointerDown={(e) => handlePointerDown(e, acc.id)} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} />
                    <div className="codex-card-title-wrap" style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: "6px" }}>
                      {avatarUrl && !failedAvatarIds.has(acc.id) ? (
                        <img className="codex-card-avatar" src={avatarUrl} alt="Avatar" referrerPolicy="no-referrer" onError={() => { setFailedAvatarIds((prev) => new Set(prev).add(acc.id)); }} />
                      ) : (
                        <div className="codex-card-avatar" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", fontWeight: "bold", background: "var(--border-color)", color: "var(--text-primary)" }}>
                          {acc.label ? acc.label.charAt(0).toUpperCase() : "C"}
                        </div>
                      )}
                      {isMonitored && <MonitoredHeartbeatIcon />}
                      {editingId === acc.id ? (
                        <input className="codex-label-input" style={{ width: `${Math.max(4, editingValue.length) * 7.5}px`, maxWidth: "160px", minWidth: "30px" }} value={editingValue} onChange={(e) => setEditingValue(e.target.value)} onBlur={() => handleRenameSave(acc)} onKeyDown={(e) => handleRenameKeyDown(acc, e)} onClick={(e) => e.stopPropagation()} autoFocus />
                      ) : (
                        <span className="codex-label-text" onClick={(e) => handleStartRename(acc, e)} data-tooltip="Click to rename this account label" style={{ borderBottom: "1px dashed var(--border-color)", paddingBottom: "1px" }}>{acc.label}</span>
                      )}
                      {acc.email && (
                        <span className="codex-card-header-email" title={acc.email} data-tooltip={copiedEmailId === acc.id ? "Copied" : "Click to copy email"} role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); handleCopyEmail(acc.id, acc.email!, e.currentTarget); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); handleCopyEmail(acc.id, acc.email!, e.currentTarget); } }}>{acc.email}</span>
                      )}
                      {planText && planText !== "—" && (
                        <span className="codex-card-tier-badge">{formatCompactTierName(planText)}</span>
                      )}
                    </div>
                    <div className="codex-card-header-actions" style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                      <button type="button" className={`codex-card-refresh-btn${refreshingIds.has(acc.id) || codexUsageCache[acc.id]?.loading ? " spinning" : ""}`} onClick={(e) => handleRefresh(e, acc)} data-tooltip="Refresh quota for this account" aria-label={`Refresh quota for ${acc.label}`}>
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 018-8 8 8 0 016.93 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M20 12a8 8 0 01-8 8 8 8 0 01-6.93-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M18 4l2 4-4-.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 20l-2-4 4 .5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                      <button type="button" className="codex-card-models-btn" onClick={(e) => { e.stopPropagation(); setAvailableModelsAccount(acc); }} data-tooltip="Show available models" aria-label={`Show available models for ${acc.label}`}>
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true"><path d="M4 5.5h16M4 12h16M4 18.5h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="18" cy="18.5" r="2" stroke="currentColor" strokeWidth="1.5" /></svg>
                      </button>
                      {acc.id !== currentAppliedId ? (
                        <button className="card-apply-btn" onClick={(e) => { e.stopPropagation(); onApply(acc); }} data-tooltip="Set this account as the active workspace account">Apply</button>
                      ) : (
                        <span className="card-active-badge"><span className="card-active-dot" />Active</span>
                      )}
                      <button className="codex-card-delete-btn" onClick={(e) => { e.stopPropagation(); onDelete(acc); }} data-tooltip="Remove this account from QuotaShift">×</button>
                    </div>
                  </div>

                  <div className="codex-card-row">
                    <div className="codex-card-info">
                      <div className="codex-card-plan-wrap" style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0, flex: 1 }}>
                        <div className="codex-card-plan" style={{ whiteSpace: "nowrap", flexShrink: 0 }}><span className="plan-full">{planText}</span><span className="plan-compact">{formatCompactTierName(planText)}</span></div>
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
                              style={{ fontSize: "8.5px", color: "var(--codex-accent, #4ade80)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", minWidth: 0, maxWidth: "100%", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "2px" }}
                            >{acc.email}</span>
                          </>
                        )}
                      </div>
                      <div className="codex-card-meta-stack" style={{ flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8px" }}>
                        {canOpenResets ? (
                          <button
                            type="button"
                            className="codex-card-meta codex-card-meta--link"
                            onClick={(e) => { e.stopPropagation(); setResetCreditsAccount(acc); if (!resetCredits) void handleRefresh(e, acc); }}
                            data-tooltip={resetsTooltip || "Click to view reset credits"}
                            style={{ background: "none", border: "none", padding: 0, color: "inherit" }}
                          >
                            {resetsSummary}
                          </button>
                        ) : (
                          <span className="codex-card-meta" style={{ userSelect: "none" }}>{resetsSummary}</span>
                        )}
                        {formatLastUsed(acc.lastUsedAt) ? <div className="account-last-used">{formatLastUsed(acc.lastUsedAt)}</div> : null}
                      </div>
                    </div>

                    {cache && !cache.loading && !cache.error && (
                      <div className="codex-card-limits">
                        {cache.isOAuth ? (() => {
                          const windowsToRender = normalizeCodexUsageWindows(cache.rate_limit);
                          if (windowsToRender.length === 0) {
                            return <div style={{ fontSize: "8.5px", color: "var(--text-secondary)" }}>No rate-limit windows reported.</div>;
                          }
                          return (
                            <div className="quota-limits-container" style={{ display: "grid", gridTemplateColumns: `repeat(${windowsToRender.length}, 1fr)`, gap: "8px" }}>
                              {windowsToRender.map((item, idx) => {
                                const pct = Math.round(Math.max(0, 100 - item.usedPercent));
                                const resetStr = item.resetAt ? formatAbsoluteTime(new Date(item.resetAt * 1000).toISOString()) : "Ready";
                                return (
                                  <div key={`${item.kind}-${item.resetAt ?? idx}`} className="quota-limit-col">
                                    <div className="quota-limit-label-container"><span className="quota-limit-name" title={item.label}><span className="label-full">{item.label}</span><span className="label-compact">{formatCompactLimitLabel(item.label)}</span></span><span className="quota-limit-reset" title={resetStr}>{resetStr}</span></div>
                                    <div className="quota-limit-bar-container"><div className="progress-container"><div className="progress-bar progress-bar--codex" style={{ width: `${pct}%` }} /></div><span className="quota-value">{pct}%</span></div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })() : cache.snapshot ? (
                          <CodexSpendBreakdown snapshot={cache.snapshot} />
                        ) : null}
                      </div>
                    )}
                  </div>

                  {cache && cache.error && (
                    <div className="codex-card-status codex-card-status--error" style={{ marginTop: "10px", fontSize: "9px", color: "#f87171" }}>
                      <span>Failed to load: {cache.error}</span>
                    </div>
                  )}
                </div>
              );
            })}
              </div>
            )}
          </div>
        </>
      )}

      {codexSection === "pools" && (
        <div className="app-content" style={{ paddingTop: "6px" }}>
          <section style={{ marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", gap: "8px" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--text-secondary)" }}>Model Pools</div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div className="codex-routing-panel codex-routing-panel--inline">
                  <div className="codex-routing-copy" data-tooltip={poolRoutingEnabled ? (routerStatus?.running ? `Running · ${routerStatus.baseUrl ?? "loopback"}` : "Starting…") : "Pool routing is currently off"}>
                    <span className="codex-routing-title">Pool Routing</span>
                    <span className="codex-routing-status">
                      {poolRoutingEnabled ? (routerStatus?.running ? (<>{"Running · "}<span data-tooltip="Click to copy URL" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(routerStatus.baseUrl ?? ""); }} style={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "2px", color: "var(--codex-accent, #4ade80)" }}>{routerStatus.baseUrl ?? "loopback"}</span></>) : "Starting…") : "Off"}
                    </span>
                  </div>
                  <button type="button" className={`codex-pool-switch ${poolRoutingEnabled ? "codex-pool-switch--on" : ""}`} role="switch" aria-checked={poolRoutingEnabled} aria-label="Pool Routing" data-tooltip={poolRoutingEnabled ? "Disable pool routing" : "Enable pool routing"} disabled={poolRoutingBusy} onClick={onTogglePoolRouting}>
                    <span className="codex-pool-switch-thumb" />
                  </button>
                </div>
                <button className="account-action-btn account-action-btn--add" onClick={onNewPool}><span style={{ fontSize: "12px", lineHeight: 1 }}>+</span> New Pool</button>
              </div>
            </div>
            {pools.length === 0 ? (
              <div style={{ fontSize: "8.5px", color: "var(--text-secondary)", padding: "8px 0" }}>No model pools. Create one to combine account capacity for a configured Codex model.</div>
            ) : pools.map((pool) => (
              <CodexPoolCard key={pool.id} pool={pool} accounts={accounts} usageCache={codexUsageCache} active={pool.id === activePoolId} appliedAccountId={appliedId} routerStatus={routerStatus} onApply={onApplyPool} onEdit={onEditPool} onDelete={onDeletePool} />
            ))}
          </section>
        </div>
      )}

      <CodexAvailableModelsDialog
        isOpen={Boolean(availableModelsAccount)}
        account={availableModelsAccount}
        entry={availableModelsAccount ? codexModelCache[availableModelsAccount.id] : undefined}
        onClose={() => setAvailableModelsAccount(null)}
        onRescan={onRescanModels}
      />

      <CodexResetCreditsDialog
        isOpen={Boolean(resetCreditsAccount)}
        account={resetCreditsAccount}
        creditsData={resetCreditsAccount ? (codexUsageCache[resetCreditsAccount.id]?.resetCredits ?? (codexUsageCache[resetCreditsAccount.id]?.rate_limit as any)?.reset_credits ?? resetCreditsAccount.resetCredits ?? null) : null}
        isLoading={Boolean(resetCreditsAccount && (codexUsageCache[resetCreditsAccount.id]?.loading || refreshingIds.has(resetCreditsAccount.id)))}
        onClose={() => setResetCreditsAccount(null)}
      />
    </div>
  );
};
