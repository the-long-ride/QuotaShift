import React, { useState } from "react";
import { deobfuscate } from "../utils/auth";
import { AntigravityAccount, FullStatus } from "../utils/types";
import { formatAbsoluteTime } from "../utils/format-time";
import { aggregateCloudQuotasIntoPools } from "../utils/antigravity-quota";
import { resolveAntigravityPlanName } from "../App";
import { reorderItems } from "../utils/account-order";

interface AntigravityTabProps {
  accounts: AntigravityAccount[];
  activeId: string | null;
  appliedId: string | null;
  lastFullStatus: FullStatus | null;
  antigravityUsageCache: Record<string, any>;
  onApply: (acc: AntigravityAccount) => Promise<void>;
  onDelete: (acc: AntigravityAccount) => Promise<void>;
  onRename: (acc: AntigravityAccount, newLabel: string) => void;
  onTrack: (acc: AntigravityAccount) => void;
  onRefreshQuota: (acc: AntigravityAccount) => void;
  onSwitchBest: () => void;
  onReorder: (orderedIds: string[]) => void;
  onAddAccountClick: () => void;
}

export const AntigravityTab: React.FC<AntigravityTabProps> = ({
  accounts,
  activeId,
  appliedId,
  lastFullStatus,
  antigravityUsageCache,
  onApply,
  onDelete,
  onRename,
  onTrack,
  onRefreshQuota,
  onSwitchBest,
  onReorder,
  onAddAccountClick,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);


  if (accounts.length === 0 && !lastFullStatus?.email) {
    return (
      <div className="tab-panel tab-panel--active">
        <div className="account-bar">
          <div className="account-bar-title" style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--text-secondary)" }}>
            Antigravity Accounts
          </div>
          <div className="account-bar-actions">
            <button className="account-action-btn account-action-btn--add" onClick={onAddAccountClick} data-tooltip="Connect and add a new Antigravity account">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="10" height="10">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Add Account
            </button>
          </div>
        </div>
        <div className="app-content">
          <div className="codex-empty-state">
            <div className="codex-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
                <circle cx="12" cy="12" r="9" stroke="currentColor" opacity="0.4" />
                <path d="M9 9l6 3-6 3V9z" fill="currentColor" opacity="0.4" />
              </svg>
            </div>
            <p className="codex-empty-title">No Antigravity accounts</p>
            <p className="codex-empty-sub">Click <strong>Add Account</strong> to connect your Antigravity session</p>
          </div>
        </div>
      </div>
    );
  }

  const handleStartRename = (acc: AntigravityAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(acc.id);
    setEditingValue(acc.label);
  };

  const handleRenameSave = (acc: AntigravityAccount) => {
    const trimmed = editingValue.trim();
    if (trimmed && trimmed !== acc.label) {
      onRename(acc, trimmed);
    }
    setEditingId(null);
  };

  const handleRenameKeyDown = (acc: AntigravityAccount, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleRenameSave(acc);
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id === draggingId) return;
    setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    setDraggingId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const reordered = reorderItems(accounts, sourceId, targetId);
    onReorder(reordered.map((a) => a.id));
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  return (
    <div className="tab-panel tab-panel--active">
      <div className="account-bar">
        <div className="account-bar-title" style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--text-secondary)" }}>
          Antigravity Accounts
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
        Click a card to monitor in tray · Apply switches active session
      </div>

      <div className="app-content">
        <div className="codex-accounts-container" style={{ display: "flex", flexDirection: "column" }}>
          {lastFullStatus?.email && !accounts.some((a) => a.email?.toLowerCase() === lastFullStatus.email?.toLowerCase()) && (
            <div
              className="account-card"
              style={{
                border: "1px dashed #eab308",
                background: "rgba(234, 179, 8, 0.05)",
                cursor: "default",
                marginRight: "6px",
                marginBottom: "10px",
              }}
            >
              <div className="codex-card-header">
                <div className="codex-card-title-wrap" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                  <div className="codex-card-avatar" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", fontWeight: "bold", background: "#eab308", color: "#000000" }}>
                    ?
                  </div>
                  <span className="codex-label-text" style={{ fontWeight: 600, color: "#eab308" }}>
                    Unsaved Active IDE Session
                  </span>
                </div>
                <div className="codex-card-header-actions" style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                  <button
                    className="card-apply-btn"
                    style={{ background: "#eab308", color: "#000000", borderColor: "#eab308", fontWeight: 600 }}
                    onClick={() => onAddAccountClick()}
                    data-tooltip="Save this active session to QuotaShift"
                  >
                    Capture
                  </button>
                </div>
              </div>
              <div className="codex-card-info" style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginTop: "4px" }}>
                <div className="codex-card-plan-wrap" style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0, flex: 1 }}>
                  <div className="codex-card-plan" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                    {lastFullStatus.planTier || "Active IDE Session"}
                  </div>
                  <span style={{ color: "var(--text-secondary)", fontSize: "9px", flexShrink: 0, userSelect: "none" }}>·</span>
                  <div
                    className="codex-card-email-info"
                    data-tooltip={lastFullStatus.email}
                    style={{ fontSize: "8.5px", color: "var(--text-secondary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}
                  >
                    {lastFullStatus.email}
                  </div>
                </div>
              </div>
            </div>
          )}

          {accounts.map((acc) => {
            const isSelected = acc.id === activeId;
            const isMonitoredAg = acc.id === activeId && (!lastFullStatus || !lastFullStatus.monitoredCodex);

            let avatarUrl = "";
            if (acc.profileUrl) {
               try {
                 const dec = deobfuscate(acc.profileUrl);
                 if (dec && dec.startsWith("http")) avatarUrl = dec;
               } catch (e) {
                 console.error("Avatar parse error:", e);
               }
            }

            return (
              <div
                key={acc.id}
                id={`ag-account-${acc.id}`}
                className={`account-card ${isSelected ? "account-card--active" : ""} ${isMonitoredAg ? "monitored" : ""} ${dragOverId === acc.id ? "account-card--drag-over" : ""} ${draggingId === acc.id ? "account-card--dragging" : ""}`}
                style={{ cursor: "pointer" }}
                onClick={() => onTrack(acc)}
                onDragOver={(e) => handleDragOver(e, acc.id)}
                onDrop={(e) => handleDrop(e, acc.id)}
              >
                <div className="codex-card-header">
                  <div
                    className="card-drag-handle"
                    draggable
                    onDragStart={(e) => handleDragStart(e, acc.id)}
                    onDragEnd={handleDragEnd}
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
                  <div className="codex-card-title-wrap" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                    {avatarUrl ? (
                      <img className="codex-card-avatar" src={avatarUrl} alt="Avatar" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="codex-card-avatar" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", fontWeight: "bold", background: "var(--border-color)", color: "var(--text-primary)" }}>
                        {acc.label ? acc.label.charAt(0).toUpperCase() : "A"}
                      </div>
                    )}

                    {isMonitoredAg && (
                      <svg
                        className="monitored-heartbeat-svg"
                        data-tooltip="This account is actively monitored in the background for quota changes"
                        viewBox="0 0 512 432.41"
                        style={{ width: "12px", height: "10px", fill: "var(--accent-white)", flexShrink: 0, display: "inline-block", verticalAlign: "middle", marginRight: "4px" }}
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
                  <div className="codex-card-header-actions" style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                    {antigravityUsageCache[acc.id]?.loading && (
                      <div className="codex-spinner" style={{ width: "8px", height: "8px", borderWidth: "1.5px", flexShrink: 0 }} />
                    )}
                    {acc.id !== appliedId ? (
                      <button
                        className="card-apply-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onApply(acc);
                        }}
                        data-tooltip="Set this account as the active workspace account"
                      >
                        Apply
                      </button>
                    ) : (
                      <span className="card-active-badge">
                        <span className="card-active-dot"></span>Active
                      </span>
                    )}

                    <button
                      className="codex-card-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(acc);
                      }}
                      data-tooltip="Remove this account from QuotaShift"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="codex-card-info" style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginTop: "4px" }}>
                  <div className="codex-card-plan-wrap" style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0, flex: 1 }}>
                    <div className="codex-card-plan" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                      {isMonitoredAg && lastFullStatus?.planTier
                        ? resolveAntigravityPlanName(lastFullStatus.planTier)
                        : acc.lastPlan || "—"}
                    </div>
                    {acc.email && (
                      <>
                        <span style={{ color: "var(--text-secondary)", fontSize: "9px", flexShrink: 0, userSelect: "none" }}>·</span>
                        <div
                          className="codex-card-email-info"
                          data-tooltip={acc.email}
                          style={{ fontSize: "8.5px", color: "var(--text-secondary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}
                        >
                          {acc.email}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="codex-card-meta" style={{ flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8px" }}>
                    {isMonitoredAg && lastFullStatus?.credits
                      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(lastFullStatus.credits.balance)
                      : acc.lastBalance || "—"}
                  </div>
                </div>

                {/* Per-card error state from direct cloud fetch */}
                {(() => {
                  const cache = antigravityUsageCache[acc.id];
                  if (cache?.error && !acc.quotas?.length) {
                    return (
                      <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
                        <span style={{ fontSize: "8px", color: "var(--error-color, #ff6b6b)", opacity: 0.8 }}>⚠ Quota unavailable</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); onRefreshQuota(acc); }}
                          style={{ fontSize: "7.5px", padding: "1px 5px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-color)", borderRadius: "3px", color: "var(--text-secondary)", cursor: "pointer" }}
                          data-tooltip="Retry fetching quota from Google's cloud API"
                        >
                          Retry
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}

                {(() => {
                  const displayQuotas = (isMonitoredAg && lastFullStatus?.quotas && lastFullStatus.quotas.length > 0 && (!lastFullStatus.email || !acc.email || lastFullStatus.email.toLowerCase() === acc.email.toLowerCase()))
                    ? lastFullStatus.quotas
                    : (acc.quotas && acc.quotas.length > 0
                      ? acc.quotas
                      : (acc.cloudQuotas ? aggregateCloudQuotasIntoPools(acc.cloudQuotas) : null));

                  if (!displayQuotas || displayQuotas.length === 0) return null;

                  return (
                    <div className="codex-card-limits" style={{ marginTop: "10px" }}>
                      {(() => {
                        const getModelPriority = (modelName: string): number => {
                          const name = modelName.toLowerCase();
                          if (name.includes("gemini")) return 1;
                          if (name.includes("claude")) return 2;
                          if (name.includes("gpt") || name.includes("openai") || name.includes("o1") || name.includes("o3")) return 3;
                          return 4;
                        };
                        const sorted = [...displayQuotas].sort((a, b) => {
                          const pA = getModelPriority(a.model || "");
                          const pB = getModelPriority(b.model || "");
                          if (pA !== pB) return pA - pB;
                          return (a.model || "").localeCompare(b.model || "");
                        });
                        return sorted.map((q, idx) => {
                          const fiveHourResetStr = q.fiveHourDisabled
                            ? "Disabled"
                            : q.fiveHourReset
                            ? formatAbsoluteTime(q.fiveHourReset)
                            : "Ready";
                          const weeklyResetStr = q.weeklyDisabled
                            ? "Disabled"
                            : q.weeklyReset
                            ? formatAbsoluteTime(q.weeklyReset)
                            : "Ready";

                          const isFiveHourKnown = q.fiveHourPercent !== undefined && q.fiveHourPercent !== null;
                          const isWeeklyKnown = q.weeklyPercent !== undefined && q.weeklyPercent !== null;

                          return (
                            <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                              <div className="quota-item-header" style={{ padding: 0, border: "none", marginBottom: "2px" }}>
                                <span className="quota-model-name" style={{ fontSize: "9px", fontWeight: 600 }}>
                                  {q.model}
                                </span>
                              </div>
                              <div className="quota-limits-container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                <div className="quota-limit-col">
                                  <div className="quota-limit-label-container">
                                    <span className="quota-limit-name">5 hrs limit</span>
                                    <span className="quota-limit-reset">{isFiveHourKnown ? fiveHourResetStr : "Unavailable"}</span>
                                  </div>
                                  <div className="quota-limit-bar-container">
                                    {isFiveHourKnown ? (
                                      <>
                                        <div className="progress-container">
                                          <div className="progress-bar" style={{ width: `${q.fiveHourPercent}%` }}></div>
                                        </div>
                                        <span className="quota-value">{q.fiveHourPercent}%</span>
                                      </>
                                    ) : (
                                      <span className="quota-value" style={{ width: "100%", textAlign: "left", color: "var(--text-secondary)" }}>Not available</span>
                                    )}
                                  </div>
                                </div>
                                <div className="quota-limit-col">
                                  <div className="quota-limit-label-container">
                                    <span className="quota-limit-name">Weekly limit</span>
                                    <span className="quota-limit-reset">{isWeeklyKnown ? weeklyResetStr : "Unavailable"}</span>
                                  </div>
                                  <div className="quota-limit-bar-container">
                                    {isWeeklyKnown ? (
                                      <>
                                        <div className="progress-container">
                                          <div className="progress-bar" style={{ width: `${q.weeklyPercent}%` }}></div>
                                        </div>
                                        <span className="quota-value">{q.weeklyPercent}%</span>
                                      </>
                                    ) : (
                                      <span className="quota-value" style={{ width: "100%", textAlign: "left", color: "var(--text-secondary)" }}>Not available</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
