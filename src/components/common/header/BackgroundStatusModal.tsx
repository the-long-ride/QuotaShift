import React, { useState } from "react";
import { createPortal } from "react-dom";
import type { CodexRouterStatus } from "../../../utils/common/types";
import type { AgentApiRuntimeStatus } from "../../../hooks/desktop/useBackgroundServicesStatus";
import { loadRouterPort } from "../../../utils/common/backup/app-constants";
import { showAppToast } from "../../../utils/common/app-toast";
import { CommonSwitch } from "../CommonSwitch";
import { CustomDialog } from "../dialogs/CustomDialog";
import { AgentApiModal } from "../agent-api/AgentApiModal";
import { useCloseOnEscape } from "../dialogs/useCloseOnEscape";
import { SettingsCloseIcon } from "../settings-controls/SettingsIcons";

interface BackgroundStatusModalProps {
  onClose: () => void;
  routerStatus: CodexRouterStatus | null;
  poolRoutingBusy: boolean;
  enabledModelPoolsCount: number;
  onToggleModelRouting: () => void;
  onOpenModelRouting?: () => void;
  agentStatus: AgentApiRuntimeStatus;
  agentBusy: boolean;
  agentError: string;
  agentPort: number;
  agentWriteMode: boolean;
  onToggleAgentApi: (onRequireConfig?: () => void) => void;
  onRefresh: () => void;
}

const BackgroundActivityIcon: React.FC = () => (
  <svg
    viewBox="0 0 16 16"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 8h2.5l1.5-4 2.5 8 1.75-4H14" />
  </svg>
);

export const BackgroundStatusModal: React.FC<BackgroundStatusModalProps> = ({
  onClose,
  routerStatus,
  poolRoutingBusy,
  enabledModelPoolsCount,
  onToggleModelRouting,
  onOpenModelRouting,
  agentStatus,
  agentBusy,
  agentError,
  agentPort,
  agentWriteMode,
  onToggleAgentApi,
  onRefresh,
}) => {
  const [agentConfigOpen, setAgentConfigOpen] = useState(false);
  const [confirmStopRouting, setConfirmStopRouting] = useState(false);
  const [confirmDisableAgent, setConfirmDisableAgent] = useState(false);
  useCloseOnEscape(!agentConfigOpen && !confirmStopRouting && !confirmDisableAgent, onClose);

  const routerRunning = Boolean(routerStatus?.running);
  const configuredRouterPort = routerStatus?.port ?? loadRouterPort();
  const routerUrl =
    routerStatus?.baseUrl ||
    (configuredRouterPort ? `http://127.0.0.1:${configuredRouterPort}` : null);
  const routerDisplay = routerUrl ? routerUrl.replace(/^https?:\/\//, "") : null;
  const routedCount = routerStatus?.routedRequestCount ?? 0;
  const inFlight = routerStatus?.inFlightRequests ?? 0;
  const effectiveAgentPort = agentStatus.port ?? agentPort;
  const agentUrl = `http://localhost:${effectiveAgentPort}`;

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showAppToast(`Copied ${url} to clipboard.`, "success");
    } catch {
      showAppToast("Failed to copy URL to clipboard.", "error");
    }
  };

  return createPortal(
    <div
      className="dialog-overlay"
      data-no-window-drag
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog-box agent-api-modal bg-status-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bg-status-modal-title"
      >
        <div className="settings-modal-header agent-api-header">
          <BackgroundActivityIcon />
          <span id="bg-status-modal-title">Background Services</span>
          <button
            type="button"
            className="settings-modal-close bg-status-close"
            aria-label="Close Background Services"
            data-tooltip="Close Background Services"
            onClick={onClose}
          >
            <SettingsCloseIcon />
          </button>
        </div>

        <div className="agent-api-body">
          <section className="agent-api-panel bg-status-card" aria-label="Model Routing">
            <div className="bg-status-card-head">
              <div className="bg-status-card-title">
                <span
                  className={`bg-status-pill-dot ${routerRunning ? "bg-status-pill-dot--active" : ""}`}
                />
                <div>
                  <strong>Model Routing</strong>
                  <span>{routerRunning ? "Running" : "Stopped"}</span>
                </div>
              </div>
              <div className="bg-status-card-controls">
                <CommonSwitch
                  checked={routerRunning}
                  disabled={poolRoutingBusy}
                  onToggle={() => {
                    if (routerRunning) {
                      setConfirmStopRouting(true);
                    } else {
                      onToggleModelRouting();
                    }
                  }}
                  ariaLabel="Toggle Model Routing server"
                  tooltip={routerRunning ? "Stop Model Routing" : "Start Model Routing"}
                />
                <button
                  type="button"
                  className="dialog-btn dialog-btn--secondary"
                  data-tooltip="Open Model Routing pools configuration"
                  onClick={() => {
                    onClose();
                    onOpenModelRouting?.();
                  }}
                >
                  Configure
                </button>
              </div>
            </div>
            <div className="bg-status-metrics">
              <div>
                <span>Port</span>
                {routerRunning && routerUrl && routerDisplay ? (
                  <button
                    type="button"
                    className="bg-status-port-btn"
                    data-tooltip={`Click to copy ${routerUrl}`}
                    aria-label={`Copy Model Routing URL ${routerUrl}`}
                    onClick={() => void copyUrl(routerUrl)}
                  >
                    {routerDisplay}
                  </button>
                ) : (
                  <strong>{configuredRouterPort ?? "Auto"}</strong>
                )}
              </div>
              <div>
                <span>Enabled pools</span>
                <strong>{enabledModelPoolsCount}</strong>
              </div>
              <div>
                <span>Routed requests</span>
                <strong>{routedCount}</strong>
              </div>
              <div>
                <span>In-flight</span>
                <strong>{inFlight}</strong>
              </div>
            </div>
            <p className="bg-status-detail">
              {routerStatus?.lastRoutedModel
                ? `Last routed model: ${routerStatus.lastRoutedModel}`
                : "No routed requests yet."}
            </p>
          </section>

          <section className="agent-api-panel bg-status-card" aria-label="Agent API">
            <div className="bg-status-card-head">
              <div className="bg-status-card-title">
                <span
                  className={`bg-status-pill-dot ${agentStatus.running ? "bg-status-pill-dot--active" : ""}`}
                />
                <div>
                  <strong>Agent API</strong>
                  <span>{agentStatus.running ? "Running" : "Stopped"}</span>
                </div>
              </div>
              <div className="bg-status-card-controls">
                <CommonSwitch
                  checked={agentStatus.running}
                  disabled={agentBusy}
                  onToggle={() => {
                    if (agentStatus.running) {
                      setConfirmDisableAgent(true);
                    } else {
                      onToggleAgentApi(() => setAgentConfigOpen(true));
                    }
                  }}
                  ariaLabel="Toggle Agent API server"
                  tooltip={agentStatus.running ? "Stop Agent API" : "Start Agent API"}
                />
                <button
                  type="button"
                  className="dialog-btn dialog-btn--secondary"
                  data-tooltip="Open Agent API configuration"
                  onClick={() => setAgentConfigOpen(true)}
                >
                  Configure
                </button>
              </div>
            </div>
            <div className="bg-status-metrics">
              <div>
                <span>Port</span>
                {agentStatus.running ? (
                  <button
                    type="button"
                    className="bg-status-port-btn"
                    data-tooltip={`Click to copy ${agentUrl}`}
                    aria-label={`Copy Agent API URL ${agentUrl}`}
                    onClick={() => void copyUrl(agentUrl)}
                  >
                    localhost:{effectiveAgentPort}
                  </button>
                ) : (
                  <strong>{effectiveAgentPort}</strong>
                )}
              </div>
              <div>
                <span>Access mode</span>
                <strong>{agentWriteMode ? "Read & Rotate" : "Read-only"}</strong>
              </div>
              <div>
                <span>API key</span>
                <strong>{agentStatus.keyConfigured ? "Configured" : "Not set"}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{agentStatus.running ? "Listening" : "Idle"}</strong>
              </div>
            </div>
            {agentError && (
              <p className="agent-api-warning bg-status-error" role="alert">
                {agentError}
              </p>
            )}
          </section>
        </div>
      </div>

      {agentConfigOpen && (
        <AgentApiModal
          onClose={() => {
            setAgentConfigOpen(false);
            onRefresh();
          }}
        />
      )}
      {confirmStopRouting && (
        <CustomDialog
          title="Stop Router Server"
          message="Are you sure you want to stop the Router Server? Claude Code and other tools routed through this endpoint will be unable to process requests until it is restarted."
          isConfirm={true}
          confirmText="Stop Server"
          confirmVariant="danger"
          confirmTooltip="Stop the router server"
          cancelTooltip="Keep the router server running"
          onClose={(confirmed) => {
            setConfirmStopRouting(false);
            if (confirmed) onToggleModelRouting();
          }}
        />
      )}
      {confirmDisableAgent && (
        <CustomDialog
          title="Disable Agent API?"
          message="Connected AI agents will lose access to the local QuotaShift Agent API until you turn it back on."
          isConfirm
          confirmText="Disable API"
          cancelText="Cancel"
          confirmVariant="danger"
          onClose={(confirmed) => {
            setConfirmDisableAgent(false);
            if (confirmed) onToggleAgentApi(() => setAgentConfigOpen(true));
          }}
        />
      )}
    </div>,
    document.body,
  );
};
