import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CommonSwitch } from "../CommonSwitch";
import { CustomDialog } from "../dialogs/CustomDialog";
import { SettingsCloseIcon } from "../settings-controls/SettingsIcons";
import { useCloseOnEscape } from "../dialogs/useCloseOnEscape";
import { showAppToast } from "../../../utils/common/app-toast";
import { AgentApiCopyIcon, AgentApiIcon } from "./AgentApiIcons";
import { AgentApiKeySection } from "./AgentApiKeyPanels";
import { agentApiEnvSetup } from "./agentApiPowerShellSetup";
import { AgentApiGuidance } from "./AgentApiGuidance";
import {
  AgentApiModalFooter,
  AgentApiPortField,
  AgentApiSecurityBanner,
} from "./AgentApiModalChrome";
import type { AgentSkillTargetStatus } from "./AgentApiSkillsSection";
import { AgentApiEndpointsReference } from "./AgentApiEndpointsReference";

interface Status {
  running: boolean;
  port: number | null;
  writeEnabled: boolean;
  keyConfigured: boolean;
}

const ENABLED_KEY = "quotashift_agent_api_enabled_v1";
const PORT_KEY = "quotashift_agent_api_port_v1";
const WRITE_KEY = "quotashift_agent_api_write_v2";
const empty: Status = { running: false, port: null, writeEnabled: false, keyConfigured: false };
const msg = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const AgentApiModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [status, setStatus] = useState<Status>(empty);
  const [port, setPort] = useState(() => Number(localStorage.getItem(PORT_KEY) || 45692));
  const [writeEnabled, setWriteEnabled] = useState(
    () => localStorage.getItem(WRITE_KEY) !== "false",
  );
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState("");
  const [skills, setSkills] = useState<AgentSkillTargetStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const close = () => {
    setConfirmDisable(false);
    setRevealedKey(null);
    setManualKey("");
    onClose();
  };
  useCloseOnEscape(!confirmDisable, close);
  const refresh = async () => {
    const [next, nextSkills] = await Promise.all([
      invoke<Status>("agent_api_status"),
      invoke<AgentSkillTargetStatus[]>("agent_api_list_skills"),
    ]);
    setStatus(next);
    setSkills(nextSkills);
    if (next.running) setWriteEnabled(next.writeEnabled);
  };
  useEffect(() => {
    void refresh().catch((err) => showAppToast(msg(err), "error"));
  }, []);

  const perform = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (err) {
      showAppToast(msg(err), "error");
    } finally {
      setBusy(false);
    }
  };
  const enableApi = () =>
    perform(async () => {
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error("Port must be between 1024 and 65535");
      }
      await invoke("agent_api_start", { port, writeEnabled });
      localStorage.setItem(ENABLED_KEY, "true");
      localStorage.setItem(PORT_KEY, String(port));
      localStorage.setItem(WRITE_KEY, String(writeEnabled));
      showAppToast("Loopback API started.", "success");
    });
  const disableApi = () =>
    perform(async () => {
      await invoke("agent_api_stop");
      localStorage.setItem(ENABLED_KEY, "false");
      showAppToast("Agent API disabled.", "info");
    });
  const handleApiSwitch = () => {
    if (status.running) {
      setConfirmDisable(true);
      return;
    }
    void enableApi();
  };
  const generate = () =>
    perform(async () => {
      const value = await invoke<string>("agent_api_generate_key");
      setRevealedKey(value);
      showAppToast(
        "Key saved to the OS keyring. Copy it now: it cannot be retrieved later.",
        "success",
      );
    });
  const saveManualKey = () =>
    perform(async () => {
      await invoke("agent_api_set_key", { key: manualKey });
      setRevealedKey(null);
      setManualKey("");
      showAppToast("Custom API key saved to the OS keyring.", "success");
    });
  const runSetup = () =>
    perform(async () => {
      const targetPort = status.port ?? port;
      await invoke("agent_api_run_env_setup", { port: targetPort });
      showAppToast(
        `Opened ${setup.os === "windows" ? "PowerShell" : "Terminal"} to save user environment variables.`,
        "success",
      );
    });
  const toggleSkill = (agentId: string, nextInstalled: boolean) =>
    perform(async () => {
      const updated = await invoke<AgentSkillTargetStatus[]>("agent_api_set_skill_installed", {
        agentId,
        installed: nextInstalled,
      });
      setSkills(updated);
      const label = updated.find((item) => item.id === agentId)?.name ?? agentId;
      showAppToast(
        nextInstalled
          ? `Installed managed skill for ${label}.`
          : `Uninstalled managed skill for ${label}.`,
        nextInstalled ? "success" : "info",
      );
    });
  const copy = (value: string) =>
    perform(async () => {
      await navigator.clipboard.writeText(value);
      showAppToast("Copied to clipboard.", "success");
    });
  const url = `http://localhost:${status.port ?? port}`;
  const setup = agentApiEnvSetup(url);

  return (
    <div
      className="dialog-overlay agent-api-overlay"
      data-no-window-drag
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="dialog-box agent-api-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-api-heading"
      >
        <div className="settings-modal-header agent-api-header">
          <AgentApiIcon />
          <span id="agent-api-heading">AI Agent API</span>
          <div className="agent-api-header-controls">
            <span
              className={`agent-api-state ${status.running ? "agent-api-state--online" : "agent-api-state--offline"}`}
            >
              <span className="agent-api-state-dot" aria-hidden="true" />
              {status.running ? "Running" : "Disabled"}
            </span>
            <CommonSwitch
              checked={status.running}
              onToggle={handleApiSwitch}
              disabled={busy}
              ariaLabel={status.running ? "Disable Agent API" : "Enable Agent API"}
              tooltip={
                status.running
                  ? "Disable the local agent API"
                  : "Enable the authenticated local agent API"
              }
            />
          </div>
          <button
            type="button"
            className="settings-modal-close agent-api-close"
            aria-label="Close AI Agent API settings"
            data-tooltip="Close AI Agent API settings"
            onClick={close}
          >
            <SettingsCloseIcon />
          </button>
        </div>

        <div className="agent-api-body">
          <AgentApiSecurityBanner />

          <section className="agent-api-section" aria-labelledby="agent-api-connection">
            <h3 id="agent-api-connection">Connection</h3>
            <AgentApiPortField port={port} disabled={busy || status.running} onChange={setPort} />
            <div className="agent-api-setting">
              <div className="agent-api-setting-copy">
                <strong>Allow account rotation</strong>
                <span>Enable write operations. Off means read-only access.</span>
              </div>
              <CommonSwitch
                checked={writeEnabled}
                onToggle={() =>
                  setWriteEnabled((value) => {
                    const next = !value;
                    localStorage.setItem(WRITE_KEY, String(next));
                    return next;
                  })
                }
                disabled={busy || status.running}
                ariaLabel="Allow account rotation"
                tooltip="Allow authenticated agents to rotate saved accounts"
              />
            </div>
            <div className="agent-api-endpoint-row">
              <div className="agent-api-endpoint">
                <span>Endpoint</span>
                <code>{status.running ? url : "Disabled"}</code>
                {status.running && (
                  <button
                    type="button"
                    className="agent-api-endpoint-copy"
                    aria-label={`Copy endpoint URL ${url}`}
                    data-tooltip={`Copy ${url}`}
                    onClick={() => void copy(url)}
                  >
                    <AgentApiCopyIcon />
                  </button>
                )}
              </div>
              <button
                type="button"
                className="dialog-btn dialog-btn--secondary agent-api-test-btn"
                disabled={busy || !status.running}
                onClick={() =>
                  void perform(async () => {
                    showAppToast(await invoke<string>("agent_api_test_connection"), "success");
                  })
                }
                data-tooltip="Test the authenticated local agent endpoint"
              >
                Test API connection
              </button>
            </div>
            <AgentApiEndpointsReference baseUrl={url} />
          </section>

          <AgentApiKeySection
            busy={busy}
            running={status.running}
            keyConfigured={status.keyConfigured}
            manualKey={manualKey}
            revealedKey={revealedKey}
            onChange={(value) => {
              setRevealedKey(null);
              setManualKey(value);
            }}
            onCopy={(value) => void copy(value)}
            onRotate={() => void generate()}
            onSave={() => void saveManualKey()}
          />

          <AgentApiGuidance
            busy={busy}
            keyConfigured={status.keyConfigured}
            setup={setup}
            copy={copy}
            runSetup={runSetup}
            skills={skills}
            onToggleSkill={toggleSkill}
          />
        </div>
        <AgentApiModalFooter onClose={close} />
      </div>
      {confirmDisable && (
        <CustomDialog
          title="Disable Agent API?"
          message="Connected AI agents will lose access to the local QuotaShift Agent API until you turn it back on."
          isConfirm
          confirmText="Disable API"
          cancelText="Cancel"
          confirmVariant="danger"
          onClose={(confirmed) => {
            setConfirmDisable(false);
            if (confirmed) void disableApi();
          }}
        />
      )}
    </div>
  );
};
