import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CommonSwitch } from "../CommonSwitch";
import { SettingsCloseIcon } from "../settings-controls/SettingsIcons";
import { useCloseOnEscape } from "../dialogs/useCloseOnEscape";
import { AgentApiIcon } from "./AgentApiIcons";
import { agentApiPowerShellSetup } from "./agentApiPowerShellSetup";
import { AgentApiGuidance } from "./AgentApiGuidance";

interface Status {
  running: boolean;
  port: number | null;
  writeEnabled: boolean;
  keyConfigured: boolean;
}

const ENABLED_KEY = "quotashift_agent_api_enabled_v1";
const PORT_KEY = "quotashift_agent_api_port_v1";
const WRITE_KEY = "quotashift_agent_api_write_v1";
const empty: Status = { running: false, port: null, writeEnabled: false, keyConfigured: false };
const msg = (error: unknown) => error instanceof Error ? error.message : String(error);

export const AgentApiModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [status, setStatus] = useState<Status>(empty);
  const [port, setPort] = useState(() => Number(localStorage.getItem(PORT_KEY) || 45692));
  const [writeEnabled, setWriteEnabled] = useState(() => localStorage.getItem(WRITE_KEY) === "true");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [installed, setInstalled] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [persistentEnv, setPersistentEnv] = useState(false);
  const close = () => {
    setRevealedKey(null);
    setShowKey(false);
    onClose();
  };
  useCloseOnEscape(true, close);
  const refresh = async () => setStatus(await invoke<Status>("agent_api_status"));
  useEffect(() => {
    void refresh().catch((err) => setError(msg(err)));
  }, []);

  const perform = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try { await fn(); await refresh(); }
    catch (err) { setError(msg(err)); }
    finally { setBusy(false); }
  };
  const startStop = () => perform(async () => {
    if (status.running) {
      await invoke("agent_api_stop");
      localStorage.setItem(ENABLED_KEY, "false");
      setNotice("Agent API disabled.");
      return;
    }
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error("Port must be between 1024 and 65535");
    }
    await invoke("agent_api_start", { port, writeEnabled });
    localStorage.setItem(ENABLED_KEY, "true");
    localStorage.setItem(PORT_KEY, String(port));
    localStorage.setItem(WRITE_KEY, String(writeEnabled));
    setNotice("Loopback API started.");
  });
  const generate = () => perform(async () => {
    const value = await invoke<string>("agent_api_generate_key");
    setRevealedKey(value);
    setShowKey(false);
    setNotice("Key saved to the OS keyring. Copy it now: it cannot be retrieved later.");
  });
  const install = () => perform(async () => {
    setInstalled(await invoke<string[]>("install_agent_skill"));
    setNotice("Managed agent skill installed.");
  });
  const uninstall = () => perform(async () => {
    const removed = await invoke<string[]>("uninstall_agent_skill");
    setInstalled([]);
    setNotice(`Removed ${removed.length} managed skill locations.`);
  });
  const copy = (value: string) => perform(async () => {
    await navigator.clipboard.writeText(value);
    setNotice("Copied to clipboard.");
  });
  const url = `http://127.0.0.1:${status.port ?? port}`;
  const script = agentApiPowerShellSetup(url, persistentEnv);

  return (
        <div className="dialog-overlay agent-api-overlay" data-no-window-drag
          onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div className="dialog-box agent-api-modal" role="dialog" aria-modal="true"
            aria-labelledby="agent-api-heading">
            <div className="settings-modal-header agent-api-header">
              <AgentApiIcon />
              <span id="agent-api-heading">AI Agent API</span>
              <span className={`agent-api-state ${status.running ? "agent-api-state--online" : ""}`}>
                {status.running ? "Running" : "Disabled"}
              </span>
              <button type="button" className="settings-modal-close agent-api-close"
                aria-label="Close AI Agent API settings" data-tooltip="Close AI Agent API settings"
                onClick={close}><SettingsCloseIcon /></button>
            </div>

            <div className="agent-api-body">
              <section className="agent-api-panel agent-api-intro" aria-label="Connection security">
                <strong>Local-only connection</strong>
                <p>Restricted to 127.0.0.1. Disabled until enabled. Read operations return
                  account IDs and quota information only, never email or account aliases.</p>
              </section>

              <section className="agent-api-section" aria-labelledby="agent-api-connection">
                <h3 id="agent-api-connection">Connection</h3>
                <div className="agent-api-setting">
                  <label htmlFor="agent-api-port">
                    <strong>Local API port</strong>
                    <span>Available on this device only (1024–65535)</span>
                  </label>
                  <input id="agent-api-port" className="form-input agent-api-port" type="number"
                    min={1024} max={65535} value={port}
                    disabled={busy || status.running}
                    onChange={(e) => setPort(Number(e.target.value))} />
                </div>
                <div className="agent-api-setting">
                  <div className="agent-api-setting-copy">
                    <strong>Allow account rotation</strong>
                    <span>Enable write operations. Off means read-only access.</span>
                  </div>
                  <CommonSwitch
                    checked={writeEnabled}
                    onToggle={() => setWriteEnabled((value) => !value)}
                    disabled={busy || status.running}
                    ariaLabel="Allow account rotation"
                    tooltip="Allow authenticated agents to rotate saved accounts"
                  />
                </div>
                <div className="agent-api-actions">
                  <button type="button" className="dialog-btn agent-api-primary"
                    disabled={busy} onClick={() => void startStop()}
                    data-tooltip={status.running ? "Disable the local agent API" : "Enable the authenticated local agent API"}>
                    {status.running ? "Disable API" : "Enable API"}
                  </button>
                  <button type="button" className="dialog-btn dialog-btn--secondary" disabled={busy || status.running}
                    onClick={() => void generate()}
                    data-tooltip={status.keyConfigured ? "Regenerate and replace the API key" : "Generate a secure API key"}>
                    {status.keyConfigured ? "Rotate API key" : "Generate API key"}
                  </button>
                  <button type="button" className="dialog-btn dialog-btn--secondary" disabled={busy || !status.running}
                    onClick={() => void perform(async () => {
                      setNotice(await invoke<string>("agent_api_test_connection"));
                    })}
                    data-tooltip="Test the authenticated local agent endpoint">
                    Test API connection
                  </button>
                </div>
                <div className="agent-api-endpoint">
                  <span>Endpoint</span><code>{status.running ? url : "Disabled"}</code>
                </div>
              </section>

              {revealedKey && (
                <section className="agent-api-section agent-api-key" aria-labelledby="agent-api-key-title">
                  <h3 id="agent-api-key-title">New API key · shown once</h3>
                  <p>Copy this credential now. Never commit, log, or share it with unrelated software.</p>
                  <div className="agent-api-key-row">
                    <input className="form-input" aria-label="New API key" readOnly
                      type={showKey ? "text" : "password"} value={revealedKey} />
                    <button type="button" className="dialog-btn dialog-btn--secondary"
                      onClick={() => setShowKey((value) => !value)}
                      data-tooltip={showKey ? "Hide API key" : "Reveal API key"}>
                      {showKey ? "Hide" : "Show"}
                    </button>
                    <button type="button" className="dialog-btn" disabled={busy}
                      data-tooltip="Copy the newly generated API key"
                      onClick={() => void copy(revealedKey)}>Copy key</button>
                  </div>
                </section>
              )}

              <AgentApiGuidance
                busy={busy} persistentEnv={persistentEnv}
                setPersistentEnv={setPersistentEnv} script={script}
                copy={copy} install={install} uninstall={uninstall}
                installed={installed}
              />
              {notice && <div className="agent-api-notice" role="status">{notice}</div>}
              {error && <div className="agent-api-error" role="alert">{error}</div>}
            </div>
            <div className="agent-api-footer">
              <button type="button" className="dialog-btn dialog-btn--secondary"
                data-tooltip="Close AI Agent API settings" onClick={close}>Close</button>
            </div>
          </div>
        </div>
  );
};
