import React from "react";
import { CodexAccount, CodexAccountPool, CodexRouterStatus } from "../../utils/common/types";
import { CodexPoolsList } from "./CodexPoolsList";

interface CodexPoolsSectionProps {
  title?: string;
  role?: string;
  routingLabel?: string;
  "aria-checked"?: boolean;
  pools: CodexAccountPool[];
  accounts: CodexAccount[];
  usageCache: Record<string, any>;
  activePoolId?: string | null;
  appliedAccountId?: string | null;
  routerStatus?: CodexRouterStatus | null;
  poolRoutingEnabled?: boolean;
  poolRoutingBusy?: boolean;
  onTogglePoolRouting?: () => void;
  onApplyPool?: (pool: CodexAccountPool) => void;
  onNewPool?: () => void;
  onEditPool?: (pool: CodexAccountPool) => void;
  onDeletePool?: (pool: CodexAccountPool) => void;
}

export const CodexPoolsSection: React.FC<CodexPoolsSectionProps> = ({
  pools,
  accounts,
  usageCache,
  activePoolId,
  appliedAccountId,
  routerStatus,
  poolRoutingEnabled = false,
  poolRoutingBusy = false,
  onTogglePoolRouting = () => {},
  onApplyPool = () => {},
  onNewPool = () => {},
  onEditPool = () => {},
  onDeletePool = () => {},
}) => {
  return (
    <div className="app-content" style={{ paddingTop: "6px" }}>
      <section style={{ marginBottom: "12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "6px",
            gap: "8px",
          }}
        >
          <div
            style={{
              fontSize: "9px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.4px",
              color: "var(--text-secondary)",
            }}
          >
            Model Pools
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div className="codex-routing-panel codex-routing-panel--inline">
              <div
                className="codex-routing-copy"
                data-tooltip={
                  poolRoutingEnabled
                    ? routerStatus?.running
                      ? `Running · ${routerStatus.baseUrl ?? "loopback"}`
                      : "Starting…"
                    : "Pool routing is currently off"
                }
              >
                <span className="codex-routing-title">Pool Routing</span>
                <span className="codex-routing-status">
                  {poolRoutingEnabled ? (
                    routerStatus?.running ? (
                      <>
                        {"Running · "}
                        <span
                          data-tooltip="Click to copy URL"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(routerStatus.baseUrl ?? "");
                          }}
                          style={{
                            cursor: "pointer",
                            textDecoration: "underline",
                            textDecorationStyle: "dotted",
                            textUnderlineOffset: "2px",
                            color: "var(--codex-accent, #4ade80)",
                          }}
                        >
                          {routerStatus.baseUrl ?? "loopback"}
                        </span>
                      </>
                    ) : (
                      "Starting…"
                    )
                  ) : (
                    "Off"
                  )}
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
            <button
              type="button"
              className="account-action-btn account-action-btn--add"
              onClick={onNewPool}
              data-tooltip="Create a new model pool"
            >
              <span style={{ fontSize: "12px", lineHeight: 1 }}>+</span> New Pool
            </button>
          </div>
        </div>
        <CodexPoolsList
          pools={pools}
          accounts={accounts}
          usageCache={usageCache}
          activePoolId={activePoolId}
          appliedAccountId={appliedAccountId}
          routerStatus={routerStatus}
          onApplyPool={onApplyPool}
          onEditPool={onEditPool}
          onDeletePool={onDeletePool}
        />
      </section>
    </div>
  );
};
