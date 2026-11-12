import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

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

export const AgentApiSettings: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(empty);
  const [port, setPort] = useState(() => Number(localStorage.getItem(PORT_KEY) || 45692));
  const [writeEnabled, setWriteEnabled] = useState(() => localStorage.getItem(WRITE_KEY) === "true");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [installed, setInstalled] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = async () => setStatus(await invoke<Status>("agent_api_status"));
  useEffect(() => {
    if (open) void refresh().catch((err) => setError(msg(err)));
  }, [open]);

  const perform = async (fn: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); await refresh(); } catch (err) { setError(msg(err)); }
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
    setNotice("Key generated in the OS keyring. This is its only display.");
  });
  const install = () => perform(async () => {
    const paths = await invoke<string[]>("install_agent_skill");
    setInstalled(paths);
    setNotice("Managed agent skill installed.");
  });
  const uninstall = () => perform(async () => {
    const removed = await invoke<string[]>("uninstall_agent_skill");
    setInstalled([]);
    setNotice(`Removed ${removed.length} managed skill locations.`);
  });
  const copy = (value: string) => perform(async () => {
    await navigator.clipboard.writeText(value);
    setNotice("Copied.");
  });
  const url = `http://127.0.0.1:${status.port ?? port}`;
  const ps = revealedKey
    ? [`$env:QUOTASHIFT_AGENT_API_URL=${JSON.stringify(url)}`, `$env:QUOTASHIFT_AGENT_API_KEY=${JSON.stringify(revealedKey)}`].join("\n")
    : null;

  return (
    <>
      <button type="button" className="settings-action-row settings-toggle-row"
        onClick={() => setOpen(true)} data-tooltip="Configure localhost agent API and skill installation">
        <span className="settings-row-icon" aria-hidden="true">%</span>
        <span className="settings-toggle-copy">
          <span className="settings-toggle-label">AI Agent API</span>
          <span className="settings-toggle-description">
            Configure a separate authenticated local API for quota access and account rotation.
          </span>
        </span>
        <span className="settings-unit">Configure</span>
      </button>
      {open && (
        <div className="dialog-overlay agent-api-overlay" data-no-window-drag
          onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="dialog-box agent-api-modal" role="dialog" aria-modal="true"
            aria-label="AI Agent API settings">
            <div className="settings-modal-header">
              <strong>AI Agent API</strong>
              <button type="button" className="settings-modal-close" data-tooltip="Close agent API settings"
                onClick={() => { setRevealedKey(null); setOpen(false); }}>×</button>
            </div>
            <div className="agent-api-body">
              <p>Local only (127.0.0.1). The API is disabled until you enable it.
                Read access lists account IDs and quota only; no email or alias.</p>
              <label htmlFor="agent-api-port">Local API port</label>
              <input id="agent-api-port" type="number" min={1024} max={65535}
                value={port} disabled={busy || status.running}
                onChange={(e) => setPort(Number(e.target.value))} />
              <label className="agent-api-option">
                <input type="checkbox" checked={writeEnabled} disabled={busy || status.running}
                  onChange={(e) => setWriteEnabled(e.target.checked)} />
                Permit account rotation (read-only when unchecked)
              </label>
              <div className="agent-api-actions">
                <button type="button" className="dialog-btn" data-tooltip={status.running ? "Disable the local agent API" : "Enable the authenticated local agent API"}
                  onClick={() => void startStop()}>{status.running ? "Disable API" : "Enable API"}</button>
                <button type="button" className="dialog-btn dialog-btn--secondary" data-tooltip={status.keyConfigured ? "Regenerate the API key" : "Generate a secure API key"} disabled={busy || status.running}
                  onClick={() => void generate()}>{status.keyConfigured ? "Rotate API key" : "Generate API key"}</button>
              </div>
              <div className="agent-api-address">Endpoint: {status.running ? url : "Disabled"}</div>
              <button type="button" className="dialog-btn dialog-btn--secondary"
                data-tooltip="Test the authenticated local agent endpoint" disabled={busy || !status.running}
                onClick={() => void perform(async () => {
                  setNotice(await invoke<string>("agent_api_test_connection"));
                })}>Test API connection</button>
              {revealedKey && (
                <div className="agent-api-key">
                  <p>Copy your key now. It will not be shown again. Never commit or log it.</p>
                  <input value={revealedKey} aria-label="New API key" readOnly />
                  <button type="button" className="dialog-btn dialog-btn--secondary"
                    data-tooltip="Copy the newly generated API key" onClick={() => void copy(revealedKey)}>Copy key</button>
                  {ps && <button type="button" className="dialog-btn dialog-btn--secondary"
                    data-tooltip="Copy environment variables for the agent PowerShell process" onClick={() => void copy(ps)}>Copy PowerShell environment setup</button>}
                  <button type="button" className="dialog-btn dialog-btn--secondary"
                    data-tooltip="Hide generated API key" onClick={() => setRevealedKey(null)}>Hide key</button>
                </div>
              )}
              <div className="agent-api-actions">
                <button type="button" className="dialog-btn dialog-btn--secondary" disabled={busy}
                  data-tooltip="Install QuotaShift skill in supported agent skill locations" onClick={() => void install()}>Install Agent Skill</button>
                <button type="button" className="dialog-btn dialog-btn--secondary" disabled={busy}
                  data-tooltip="Remove only files installed by QuotaShift" onClick={() => void uninstall()}>Uninstall Managed Skill</button>
              </div>
              <p>Canonical: ~/.agents/skills/quotashift-rotation; Claude and Antigravity
                receive managed links or safe copies. Codex uses the canonical path.
                OpenCode discovers the canonical skill automatically. To configure explicitly,
                add <code>{'{"skills": ["~/.agents/skills"]}'}</code> to the skills array
                in opencode.jsonc without removing existing entries.</p>
              {installed.length > 0 && <p>Installed: {installed.join(", ")}</p>}
              {notice && <p className="agent-api-notice" role="status">{notice}</p>}
              {error && <p className="agent-api-error" role="alert">{error}</p>}
              <p>Agents must receive QUOTASHIFT_AGENT_API_URL and QUOTASHIFT_AGENT_API_KEY
                as environment variables in their own process. No key is stored in skill files.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
