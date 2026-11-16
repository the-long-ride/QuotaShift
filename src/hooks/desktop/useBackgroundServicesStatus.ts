import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CodexRouterStatus } from "../../utils/common/types";

export interface AgentApiRuntimeStatus {
  running: boolean;
  port: number | null;
  writeEnabled: boolean;
  keyConfigured: boolean;
}

const AGENT_ENABLED_KEY = "quotashift_agent_api_enabled_v1";
const AGENT_PORT_KEY = "quotashift_agent_api_port_v1";
const AGENT_WRITE_KEY = "quotashift_agent_api_write_v2";

const EMPTY_AGENT_STATUS: AgentApiRuntimeStatus = {
  running: false,
  port: null,
  writeEnabled: false,
  keyConfigured: false,
};

export function useBackgroundServicesStatus(
  propRouterStatus?: CodexRouterStatus | null,
  onTogglePoolRouting?: () => void,
  modalOpen = false,
) {
  const [agentStatus, setAgentStatus] = useState<AgentApiRuntimeStatus>(EMPTY_AGENT_STATUS);
  const [polledRouterStatus, setPolledRouterStatus] = useState<CodexRouterStatus | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState("");

  const routerStatus = propRouterStatus ?? polledRouterStatus;

  const refresh = useCallback(async () => {
    try {
      const nextAgent = await invoke<AgentApiRuntimeStatus>("agent_api_status");
      setAgentStatus(nextAgent);
    } catch {
      // Non-Tauri or early startup fallback keeps previous state.
    }
    if (propRouterStatus === undefined) {
      try {
        const nextRouter = await invoke<CodexRouterStatus>("get_codex_router_status");
        setPolledRouterStatus(nextRouter);
      } catch {
        // Ignore when router state is unavailable.
      }
    }
  }, [propRouterStatus]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (modalOpen) {
      setAgentError("");
      void refresh();
    }
  }, [modalOpen, refresh]);

  const toggleAgentApi = async (onRequireConfig?: () => void) => {
    setAgentBusy(true);
    setAgentError("");
    try {
      if (agentStatus.running) {
        await invoke("agent_api_stop");
        localStorage.setItem(AGENT_ENABLED_KEY, "false");
      } else {
        if (!agentStatus.keyConfigured) {
          setAgentError("Generate an API key in Agent API configuration before starting.");
          onRequireConfig?.();
          return;
        }
        const port = Number(localStorage.getItem(AGENT_PORT_KEY) || 45692);
        const writeEnabled = localStorage.getItem(AGENT_WRITE_KEY) !== "false";
        await invoke("agent_api_start", { port, writeEnabled });
        localStorage.setItem(AGENT_ENABLED_KEY, "true");
        localStorage.setItem(AGENT_PORT_KEY, String(port));
        localStorage.setItem(AGENT_WRITE_KEY, String(writeEnabled));
      }
      await refresh();
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : String(error));
    } finally {
      setAgentBusy(false);
    }
  };

  const toggleModelRouting = () => {
    onTogglePoolRouting?.();
    window.setTimeout(() => {
      void refresh();
    }, 300);
  };

  const agentPort = agentStatus.port ?? Number(localStorage.getItem(AGENT_PORT_KEY) || 45692);
  const agentWriteMode = agentStatus.running
    ? agentStatus.writeEnabled
    : localStorage.getItem(AGENT_WRITE_KEY) !== "false";

  return {
    routerStatus,
    agentStatus,
    agentBusy,
    agentError,
    agentPort,
    agentWriteMode,
    refresh,
    toggleAgentApi,
    toggleModelRouting,
  };
}
