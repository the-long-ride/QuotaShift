import React, { useMemo, useRef, useState } from "react";
import { CodexAccount, CodexAccountPool, CodexModelCatalogCacheEntry, CodexRouterStatus, FullStatus } from "../utils/types";
import { formatAbsoluteTime } from "../utils/format-time";
import { formatLastUsed } from "../utils/account-last-used";
import { PointerReorderController, SortableCardRect } from "../utils/pointer-reorder";
import { normalizeCodexUsageWindows } from "../utils/codex-usage-windows";
import { CodexPoolCard } from "./CodexPoolCard";
import { CodexAvailableModelsDialog } from "./CodexAvailableModelsDialog";
import { computeCodexTierSummary } from "../utils/codex-tier-summary";
import { deobfuscate, decodeJwtProfile } from "../utils/auth";

interface CodexTabProps {
  accounts: CodexAccount[];
  pools?: CodexAccountPool[];
  activePoolId?: string | null;
  activeId: string | null;
  appliedId: string | null;
  lastFullStatus: FullStatus | null;
  codexUsageCache: Record<string, any>;
  codexModelCache?: Record<string, CodexModelCatalogCacheEntry>;
  onRescanModels?: (account: CodexAccount) => void | Promise<void>;
  onApply: (acc: CodexAccount) => void;
  onDelete: (acc: CodexAccount) => void;
  onRename: (acc: CodexAccount, newLabel: string) => void;
  onTrack: (acc: CodexAccount) => void;
  onSelect?: (acc: CodexAccount) => void;
  onRefresh?: (acc: CodexAccount) => void | Promise<void>;
  onSwitchBest: () => void;
  onReorder: (orderedIds: string[]) => void;
  onAddAccountClick: () => void;
  onNewPool?: () => void;
  onEditPool?: (pool: CodexAccountPool) => void;
  onDeletePool?: (pool: CodexAccountPool) => void;
  onApplyPool?: (pool: CodexAccountPool) => void;
  poolRoutingEnabled?: boolean;
  poolRoutingBusy?: boolean;
  routerStatus?: CodexRouterStatus | null;
  onTogglePoolRouting?: () => void;
}

export const CodexTab: React.FC<CodexTabProps> = ({
  accounts,
  pools = [],
  activePoolId = null,
  activeId,
  appliedId,
  lastFullStatus,
  codexUsageCache,
  codexModelCache = {},
  onRescanModels = () => {},
  onApply,
  onDelete,
  onRename,
  onTrack,
  onSelect: _onSelect = () => {},
  onRefresh = () => {},
  onSwitchBest,
  onReorder,
  onAddAccountClick,
  onNewPool = () => {},
  onEditPool = () => {},
  onDeletePool = () => {},
  onApplyPool = () => {},
  poolRoutingEnabled = false,
  poolRoutingBusy = false,
  routerStatus = null,
  onTogglePoolRouting = () => {},
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [availableModelsAccount, setAvailableModelsAccount] = useState<CodexAccount | null>(null);
  const [codexSection, setCodexSection] = useState<"accounts" | "pools">("accounts");
  const sortableContainerRef = useRef<HTMLDivElement>(null);
  const reorderControllerRef = useRef(new PointerReorderController(4));

  const displayedAccounts = useMemo(() => {
    if (!previewIds) return accounts;
    const byId = new Map(accounts.map((account) => [account.id, account]));
    return previewIds.map((id) => byId.get(id)).filter((account): account is CodexAccount => Boolean(account));
  }, [accounts, previewIds]);

  const handleStartRename = (acc: CodexAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(acc.id);
    setEditingValue(acc.label);
  };

  const handleRenameSave = (acc: CodexAccount) => {
    const trimmed = editingValue.trim();
    if (trimmed && trimmed !== acc.label) onRename(acc, trimmed);
    setEditingId(null);
  };

  const handleRenameKeyDown = (acc: CodexAccount, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleRenameSave(acc);
    else if (e.key === "Escape") setEditingId(null);
  };

  const collectCardRects = (): SortableCardRect[] => {
    if (!sortableContainerRef.current) return [];
    return Array.from(sortableContainerRef.current.querySelectorAll<HTMLElement>("[data-sortable-account-id]"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { id: element.dataset.sortableAccountId || "", top: rect.top, bottom: rect.bottom };
      })
      .filter((rect) => Boolean(rect.id));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    // Capture on the container so pointermove fires even when cursor leaves the handle
    if (sortableContainerRef.current) {
      sortableContainerRef.current.setPointerCapture(event.pointerId);
    }
    reorderControllerRef.current.begin(id, event.pointerId, event.clientX, event.clientY, accounts.map((account) => account.id));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const controller = reorderControllerRef.current;
    if (!controller.ownsPointer(event.pointerId)) return;
    const update = controller.move(event.clientX, event.clientY, collectCardRects());
    if (!update.dragging) return;
    event.preventDefault();
    setDraggingId(update.sourceId);
    setPreviewIds(update.ids);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const controller = reorderControllerRef.current;
    if (!controller.ownsPointer(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const result = controller.finish();
    setDraggingId(null);
    setPreviewIds(null);
    if (result.committedIds) onReorder(result.committedIds);
  };

  const handlePointerCancel = () => {
    reorderControllerRef.current.cancel();
    setDraggingId(null);
    setPreviewIds(null);
  };

  const handleRefresh = async (e: React.MouseEvent, acc: CodexAccount) => {
    e.stopPropagation();
    if (refreshingIds.has(acc.id)) return;
    setRefreshingIds((prev) => { const next = new Set(prev); next.add(acc.id); return next; });
    try {
      await onRefresh(acc);
    } finally {
      setRefreshingIds((prev) => { const next = new Set(prev); next.delete(acc.id); return next; });
    }
  };

  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(new Set());

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

  const handleCardDoubleClick = (account: CodexAccount) => {
    onTrack(account);
  };

  const tierSummary = useMemo(
    () => computeCodexTierSummary(accounts, codexUsageCache),
    [accounts, codexUsageCache]
  );

  return (
    <div className="tab-panel tab-panel--active">
      <div className="account-bar">
        <div className="account-bar-summary">
          <span className="account-bar-total" data-tooltip="Total Codex accounts">
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
          <button className="account-action-btn account-action-btn--add" onClick={onAddAccountClick} data-tooltip="Connect and add a new Codex account">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="10" height="10">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add Account
          </button>
          {accounts.length >= 2 && (
            <button className="account-action-btn" onClick={onSwitchBest} data-tooltip="Auto-switch to the Codex account with the highest remaining quota">
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
        <div className="codex-subtabs" role="tablist" aria-label="Codex views">
          <button
            type="button"
            role="tab"
            aria-selected={codexSection === "accounts"}
            className={`codex-subtab ${codexSection === "accounts" ? "codex-subtab--active" : ""}`}
            onClick={() => setCodexSection("accounts")}
          >Accounts</button>
          <button
            type="button"
            role="tab"
            aria-selected={codexSection === "pools"}
            className={`codex-subtab ${codexSection === "pools" ? "codex-subtab--active" : ""}`}
            onClick={() => setCodexSection("pools")}
          >Pools</button>
        </div>

        {codexSection === "pools" && (
        <section style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", gap: "8px" }}>
            <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--text-secondary)" }}>Model Pools</div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div className="codex-routing-panel codex-routing-panel--inline">
                <div
                  className="codex-routing-copy"
                  data-tooltip={poolRoutingEnabled ? (routerStatus?.running ? `Running · ${routerStatus.baseUrl ?? "loopback"}` : "Starting…") : "Pool routing is currently off"}
                >
                  <span className="codex-routing-title">Pool Routing</span>
                  <span className="codex-routing-status">
                    {poolRoutingEnabled
                      ? routerStatus?.running
                        ? (
                          <>
                            {"Running · "}
                            <span
                              data-tooltip="Click to copy URL"
                              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(routerStatus.baseUrl ?? ""); }}
                              style={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "2px", color: "var(--codex-accent, #4ade80)" }}
                            >{routerStatus.baseUrl ?? "loopback"}</span>
                          </>
                        )
                        : "Starting…"
                      : "Off"}
                  </span>
                </div>
                <button
                  type="button"
                  className={`codex-pool-switch ${poolRoutingEnabled ? "codex-pool-switch--on" : ""}`}
                  role="switch"
                  aria-checked={poolRoutingEnabled}
                  aria-label="Pool Routing"
                  data-tooltip={poolRoutingEnabled ? "Disable pool routing" : "Enable pool routing"}
                  disabled={poolRoutingBusy}
                  onClick={onTogglePoolRouting}
                >
                  <span className="codex-pool-switch-thumb" />
                </button>
              </div>
              <button className="account-action-btn account-action-btn--add" onClick={onNewPool}>
                <span style={{ fontSize: "12px", lineHeight: 1 }}>+</span> New Pool
              </button>
            </div>
          </div>
          {pools.length === 0 ? (
            <div style={{ fontSize: "8.5px", color: "var(--text-secondary)", padding: "8px 0" }}>
              No model pools. Create one to combine account capacity for a configured Codex model.
            </div>
          ) : pools.map((pool) => (
            <CodexPoolCard
              key={pool.id}
              pool={pool}
              accounts={accounts}
              usageCache={codexUsageCache}
              active={pool.id === activePoolId}
              appliedAccountId={appliedId}
              routerStatus={routerStatus}
              onApply={onApplyPool}
              onEdit={onEditPool}
              onDelete={onDeletePool}
            />
          ))}
        </section>
        )}

        {codexSection === "accounts" && (accounts.length === 0 ? (
          <div className="codex-empty-state">
            <div className="codex-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
                <path d="M9 9l6 3-6 3V9z" fill="currentColor" opacity="0.4" />
              </svg>
            </div>
            <p className="codex-empty-title">No Codex accounts</p>
            <p className="codex-empty-sub">Click <strong>Add Account</strong> to connect via API key<br />or use <strong>Browser Login</strong> for guided setup</p>
          </div>
        ) : (
          <div
            ref={sortableContainerRef}
            className="codex-accounts-container"
            style={{ display: "flex", flexDirection: "column", cursor: draggingId ? "grabbing" : undefined }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handlePointerCancel}
          >
            {displayedAccounts.map((acc) => {
              const isSelected = acc.id === activeId;
              const isMonitored = lastFullStatus?.monitoredCodex?.accountId === acc.id;
              const planText = acc.lastPlan || "—";
              const resetsText = acc.lastResets || "Click to load";
              const cache = codexUsageCache[acc.id];

              let avatarUrl = "";
              if (acc.profileUrl) {
                try {
                  const dec = deobfuscate(acc.profileUrl);
                  if (dec && dec.startsWith("http")) avatarUrl = dec;
                } catch (e) {
                  console.error("Avatar parse error:", e);
                }
              }
              if (!avatarUrl && acc.apiKey) {
                try {
                  const rawKey = deobfuscate(acc.apiKey);
                  if (rawKey.startsWith("{")) {
                    const data = JSON.parse(rawKey);
                    if (data.idToken) {
                      const profile = decodeJwtProfile(data.idToken);
                      if (profile?.picture && profile.picture.startsWith("http")) {
                        avatarUrl = profile.picture;
                      }
                    }
                  }
                } catch {}
              }

              return (
                <div
                  key={acc.id}
                  id={`codex-account-${acc.id}`}
                  className={`account-card ${isSelected ? "account-card--active" : ""} ${isMonitored ? "monitored" : ""} ${draggingId === acc.id ? "account-card--dragging" : ""}`}
                  data-sortable-account-id={acc.id}
                  style={{ cursor: "pointer" }}
                  onClick={handleCardClick}
                  onDoubleClick={() => handleCardDoubleClick(acc)}
                >
                  <div className="codex-card-header">
                    <div
                      className="card-drag-handle"
                      onPointerDown={(e) => handlePointerDown(e, acc.id)}
                      onClick={(e) => e.stopPropagation()}
                      data-tooltip="Drag to reorder"
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12">
                        <circle cx="8" cy="6" r="1.5" fill="currentColor" />
                        <circle cx="16" cy="6" r="1.5" fill="currentColor" />
                        <circle cx="8" cy="12" r="1.5" fill="currentColor" />
                        <circle cx="16" cy="12" r="1.5" fill="currentColor" />
                        <circle cx="8" cy="18" r="1.5" fill="currentColor" />
                        <circle cx="16" cy="18" r="1.5" fill="currentColor" />
                      </svg>
                    </div>
                    <div className="codex-card-title-wrap" style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: "6px" }}>
                      {avatarUrl && !failedAvatarIds.has(acc.id) ? (
                        <img
                          className="codex-card-avatar"
                          src={avatarUrl}
                          alt="Avatar"
                          referrerPolicy="no-referrer"
                          onError={() => {
                            setFailedAvatarIds((prev) => new Set(prev).add(acc.id));
                          }}
                        />
                      ) : (
                        <div
                          className="codex-card-avatar"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "8px",
                            fontWeight: "bold",
                            background: "var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        >
                          {acc.label ? acc.label.charAt(0).toUpperCase() : "C"}
                        </div>
                      )}
                      {isMonitored && (
                        <svg
                          className="monitored-heartbeat-svg"
                          data-tooltip="This account is actively monitored in the background for quota changes"
                          viewBox="0 0 512 432.41"
                          style={{ width: "12px", height: "10px", fill: "var(--accent-white)", flexShrink: 0, display: "inline-block", verticalAlign: "middle", marginRight: "2px" }}
                        >
                          <path
                            fillRule="nonzero"
                            d="M10.28 260.72C4.6 260.72 0 256.12 0 250.44c0-5.67 4.6-10.28 10.28-10.28h85.75l15.91-33.5c2.42-5.12 8.53-7.32 13.65-4.9a10.19 10.19 0 015.14 5.45l19.2 41.72L187.81 8.68c.86-5.59 6.09-9.42 11.68-8.56 4.76.74 8.24 4.65 8.64 9.24h.03l28.87 330.02 33.23-204.3c.91-5.59 6.18-9.38 11.77-8.47 4.4.71 7.69 4.14 8.44 8.29l30.44 162.18 38.55-91.25c2.19-5.22 8.2-7.66 13.41-5.47 2.48 1.05 4.33 2.96 5.36 5.23l.02-.01 15.56 34.58h107.91c5.68 0 10.28 4.61 10.28 10.28 0 5.68-4.6 10.28-10.28 10.28H387.19v-.02c-3.91 0-7.65-2.25-9.36-6.04l-8.65-19.23-42.43 100.45c-1.2 3.3-4.06 5.9-7.76 6.6-5.56 1.04-10.92-2.63-11.96-8.19L281.1 196.15l-36.91 226.9c-.43 4.88-4.31 8.89-9.35 9.32-5.65.49-10.63-3.7-11.12-9.35L194.99 94.6l-30.07 190.69c-.44 3.38-2.56 6.46-5.9 7.98-5.14 2.35-11.22.09-13.57-5.05l-24.37-52.99-9 18.95a10.275 10.275 0 01-9.58 6.54H10.28z"
                          />
                        </svg>
                      )}

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
                        <span className="codex-label-text" onClick={(e) => handleStartRename(acc, e)} data-tooltip="Click to rename this account label" style={{ borderBottom: "1px dashed var(--border-color)", paddingBottom: "1px" }}>
                          {acc.label}
                        </span>
                      )}
                    </div>
                    <div className="codex-card-header-actions" style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                      <button
                        type="button"
                        className={`codex-card-refresh-btn${refreshingIds.has(acc.id) || codexUsageCache[acc.id]?.loading ? " spinning" : ""}`}
                        onClick={(e) => handleRefresh(e, acc)}
                        data-tooltip="Refresh quota for this account"
                        aria-label={`Refresh quota for ${acc.label}`}
                      >
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
                          <path d="M4 12a8 8 0 018-8 8 8 0 016.93 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          <path d="M20 12a8 8 0 01-8 8 8 8 0 01-6.93-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          <path d="M18 4l2 4-4-.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M6 20l-2-4 4 .5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="codex-card-models-btn"
                        onClick={(e) => { e.stopPropagation(); setAvailableModelsAccount(acc); }}
                        data-tooltip="Show available models"
                        aria-label={`Show available models for ${acc.label}`}
                      >
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
                          <path d="M4 5.5h16M4 12h16M4 18.5h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          <circle cx="18" cy="18.5" r="2" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      </button>
                      {acc.id !== appliedId ? (
                        <button className="card-apply-btn" onClick={(e) => { e.stopPropagation(); onApply(acc); }} data-tooltip="Set this account as the active workspace account">Apply</button>
                      ) : (
                        <span className="card-active-badge"><span className="card-active-dot" />Active</span>
                      )}
                      <button className="codex-card-delete-btn" onClick={(e) => { e.stopPropagation(); onDelete(acc); }} data-tooltip="Remove this account from QuotaShift">×</button>
                    </div>
                  </div>

                  <div className="codex-card-info" style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginTop: "4px" }}>
                    <div className="codex-card-plan-wrap" style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0, flex: 1 }}>
                      <div className="codex-card-plan" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{planText}</div>
                      {acc.email && (
                        <>
                          <span style={{ color: "var(--text-secondary)", fontSize: "9px", flexShrink: 0, userSelect: "none" }}>·</span>
                          <span
                            className="codex-card-email-info"
                            data-tooltip={copiedEmailId === acc.id ? "Copied" : "Click to copy email"}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyEmail(acc.id, acc.email!, e.currentTarget);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                                handleCopyEmail(acc.id, acc.email!, e.currentTarget);
                              }
                            }}
                            style={{ fontSize: "8.5px", color: "var(--codex-accent, #4ade80)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", minWidth: 0, maxWidth: "100%", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "2px" }}
                          >{acc.email}</span>
                        </>
                      )}
                    </div>
                    <div className="codex-card-meta-stack" style={{ flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8px" }}>
                      <div className="codex-card-meta">{resetsText}</div>
                      {formatLastUsed(acc.lastUsedAt) ? (
                        <div className="account-last-used">{formatLastUsed(acc.lastUsedAt)}</div>
                      ) : null}
                    </div>
                  </div>

                  {cache && !cache.loading && !cache.error && (
                    <div className="codex-card-limits" style={{ marginTop: "10px" }}>
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
                                <div className="quota-limit-label-container"><span className="quota-limit-name">{item.label}</span><span className="quota-limit-reset">{resetStr}</span></div>
                                <div className="quota-limit-bar-container"><div className="progress-container"><div className="progress-bar progress-bar--codex" style={{ width: `${pct}%` }} /></div><span className="quota-value">{pct}%</span></div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })() : cache.snapshot ? (() => {
                        const snapshot = cache.snapshot;
                        const totalSpend = snapshot.models.reduce((sum: number, m: any) => sum + m.costUsd, 0);
                        const compactFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
                        if (snapshot.models.length === 0) return <div style={{ fontSize: "8.5px", color: "var(--text-secondary)" }}>No usage recorded this period.</div>;
                        return (
                          <div>
                            {snapshot.models.map((m: any, idx: number) => {
                              const pct = totalSpend > 0 ? Math.round((m.costUsd / totalSpend) * 100) : 0;
                              return (
                                <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "3px", marginBottom: "6px" }}>
                                  <div className="quota-item-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="quota-model-name" style={{ fontSize: "9px", fontWeight: 600 }}>{m.model}</span><span style={{ fontSize: "9px", color: "var(--text-secondary)" }}>{compactFormatter.format(m.costUsd)}</span></div>
                                  <div className="quota-limit-bar-container"><div className="progress-container"><div className="progress-bar progress-bar--codex" style={{ width: `${pct}%` }} /></div><span className="quota-value">{pct}%</span></div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })() : null}
                    </div>
                  )}

                  {cache && cache.error && (
                    <div className="codex-card-status codex-card-status--error" style={{ marginTop: "10px", fontSize: "9px", color: "#f87171" }}><span>Failed to load: {cache.error}</span></div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <CodexAvailableModelsDialog
        isOpen={Boolean(availableModelsAccount)}
        account={availableModelsAccount}
        entry={availableModelsAccount ? codexModelCache[availableModelsAccount.id] : undefined}
        onClose={() => setAvailableModelsAccount(null)}
        onRescan={onRescanModels}
      />
    </div>
  );
};
