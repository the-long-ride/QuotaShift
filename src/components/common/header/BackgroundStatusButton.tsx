import React, { useState } from "react";
import type { CodexRouterStatus } from "../../../utils/common/types";
import { useBackgroundServicesStatus } from "../../../hooks/desktop/useBackgroundServicesStatus";
import { BackgroundStatusModal } from "./BackgroundStatusModal";

interface BackgroundStatusButtonProps {
  routerStatus?: CodexRouterStatus | null;
  poolRoutingBusy?: boolean;
  enabledModelPoolsCount?: number;
  onTogglePoolRouting?: () => void;
  onOpenModelRouting?: () => void;
}

export const BackgroundStatusButton: React.FC<BackgroundStatusButtonProps> = ({
  routerStatus: propRouterStatus,
  poolRoutingBusy = false,
  enabledModelPoolsCount = 0,
  onTogglePoolRouting,
  onOpenModelRouting,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const {
    routerStatus,
    agentStatus,
    agentBusy,
    agentError,
    agentPort,
    agentWriteMode,
    refresh,
    toggleAgentApi,
    toggleModelRouting,
  } = useBackgroundServicesStatus(propRouterStatus, onTogglePoolRouting, modalOpen);

  const routingRunning = Boolean(routerStatus?.running);
  const agentRunning = agentStatus.running;
  const tooltip = `Background Services — Model Routing: ${routingRunning ? "Running" : "Stopped"} · Agent API: ${agentRunning ? "Running" : "Stopped"}`;

  return (
    <>
      <button
        type="button"
        id="background-status-btn"
        className={`bg-status-btn ${modalOpen ? "bg-status-btn--active" : ""}`}
        onClick={() => setModalOpen(true)}
        data-tooltip={tooltip}
        aria-label="Open Background Services status"
      >
        <span className="bg-status-dots" aria-hidden="true">
          <span
            className={`bg-status-dot bg-status-dot--routing ${routingRunning ? "bg-status-dot--active" : ""}`}
          />
          <span
            className={`bg-status-dot bg-status-dot--agent ${agentRunning ? "bg-status-dot--active" : ""}`}
          />
        </span>
        <svg
          className="bg-status-icon"
          viewBox="0 0 16 16"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 8h2.5l1.5-4 2.5 8 1.75-4H14" />
        </svg>
      </button>

      {modalOpen && (
        <BackgroundStatusModal
          onClose={() => setModalOpen(false)}
          routerStatus={routerStatus}
          poolRoutingBusy={poolRoutingBusy}
          enabledModelPoolsCount={enabledModelPoolsCount}
          onToggleModelRouting={toggleModelRouting}
          onOpenModelRouting={onOpenModelRouting}
          agentStatus={agentStatus}
          agentBusy={agentBusy}
          agentError={agentError}
          agentPort={agentPort}
          agentWriteMode={agentWriteMode}
          onToggleAgentApi={toggleAgentApi}
          onRefresh={() => void refresh()}
        />
      )}
    </>
  );
};
