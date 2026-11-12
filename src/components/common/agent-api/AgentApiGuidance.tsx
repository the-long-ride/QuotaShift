import React from "react";
import { CommonSwitch } from "../CommonSwitch";

interface AgentApiGuidanceProps {
  busy: boolean;
  persistentEnv: boolean;
  setPersistentEnv: React.Dispatch<React.SetStateAction<boolean>>;
  script: string;
  copy: (value: string) => Promise<void>;
  install: () => Promise<void>;
  uninstall: () => Promise<void>;
  installed: string[];
}

export const AgentApiGuidance: React.FC<AgentApiGuidanceProps> = ({
  busy, persistentEnv, setPersistentEnv, script, copy, install, uninstall, installed,
}) => (
  <>
              <section className="agent-api-section" aria-labelledby="agent-api-setup">
                <h3 id="agent-api-setup">Agent environment setup</h3>
                <p>Copy a PowerShell command, run it in your agent's terminal, and enter the
                  generated key at the secure prompt. The command does not embed the secret.</p>
                <div className="agent-api-setting">
                  <div className="agent-api-setting-copy">
                    <strong>Save variables for this Windows user</strong>
                    <span>{persistentEnv
                      ? "Persistent user environment variables. Restart the agent after setup."
                      : "Current PowerShell process only (recommended)."}
                    </span>
                  </div>
                  <CommonSwitch checked={persistentEnv} onToggle={() => setPersistentEnv((value) => !value)}
                    ariaLabel="Persist Agent API environment variables for current Windows user"
                    tooltip="Persist the API URL and key for future sessions" />
                </div>
                {persistentEnv && <p className="agent-api-warning" role="note">
                  User-level environment variables store the key in the Windows user registry
                  as readable text. Only enable this on a trusted device. This does not modify PATH.
                </p>}
                <div className="agent-api-code-header">
                  <span>PowerShell · {persistentEnv ? "user variables" : "session variables"}</span>
                  <button type="button" className="dialog-btn dialog-btn--secondary"
                    disabled={busy} onClick={() => void copy(script)}
                    data-tooltip="Copy PowerShell environment setup">
                    Copy PowerShell environment setup
                  </button>
                </div>
                <pre className="agent-api-command"><code>{script}</code></pre>
              </section>

              <section className="agent-api-section" aria-labelledby="agent-api-skills">
                <h3 id="agent-api-skills">Agent skills</h3>
                <div className="agent-api-actions">
                  <button type="button" className="dialog-btn agent-api-primary" disabled={busy}
                    data-tooltip="Install managed agent skill in supported agent locations"
                    onClick={() => void install()}>Install Agent Skill</button>
                  <button type="button" className="dialog-btn dialog-btn--secondary" disabled={busy}
                    data-tooltip="Remove only unmodified skills managed by QuotaShift"
                    onClick={() => void uninstall()}>Uninstall Managed Skill</button>
                </div>
                {installed.length > 0 && (
                  <div className="agent-api-install-result" role="status">
                    <strong>Installed locations</strong>
                    <ul>{installed.map((path) => <li key={path}>{path}</li>)}</ul>
                  </div>
                )}
              </section>

              <section className="agent-api-panel agent-api-notes" aria-label="Agent integration notes">
                <strong>Integration notes</strong>
                <ul>
                  <li>Canonical skill: <code>~/.agents/skills/quotashift-rotation</code>.
                    Codex and OpenCode discover this path.</li>
                  <li>Claude and Antigravity receive managed links or safe copies.</li>
                  <li>OpenCode: merge <code>{'{"skills": ["~/.agents/skills"]}'}</code> into
                    the skills array in <code>opencode.jsonc</code> without removing existing entries.</li>
                  <li>Agents must inherit <code>QUOTASHIFT_AGENT_API_URL</code> and
                    <code>QUOTASHIFT_AGENT_API_KEY</code>. Keys are not included in skill files.</li>
                </ul>
              </section>

  </>
);
