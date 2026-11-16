import React from "react";
import { CopySvgIcon } from "../icons/CopySvgIcon";
import { AgentApiTerminalRunIcon } from "./AgentApiIcons";
import { AgentApiSkillsSection, type AgentSkillTargetStatus } from "./AgentApiSkillsSection";
import type { AgentEnvSetupDescriptor } from "./agentApiPowerShellSetup";

interface AgentApiGuidanceProps {
  busy: boolean;
  keyConfigured: boolean;
  setup: AgentEnvSetupDescriptor;
  copy: (value: string) => Promise<void>;
  runSetup: () => Promise<void>;
  skills: AgentSkillTargetStatus[];
  onToggleSkill: (agentId: string, install: boolean) => Promise<void>;
}

export const AgentApiGuidance: React.FC<AgentApiGuidanceProps> = ({
  busy,
  keyConfigured,
  setup,
  copy,
  runSetup,
  skills,
  onToggleSkill,
}) => (
  <>
    <section className="agent-api-section" aria-labelledby="agent-api-setup">
      <h3 id="agent-api-setup">Agent environment setup</h3>
      <p>
        Run the setup automatically in {setup.os === "windows" ? "PowerShell" : "Terminal"} using
        your saved key, or copy the prompt-based script below. Setup always saves to your user
        scope.
      </p>
      <p className="agent-api-warning" role="note">
        {setup.warning}
      </p>
      <div className="agent-api-code-header">
        <span>{setup.shellLabel}</span>
        <div className="agent-api-code-actions">
          <button
            type="button"
            className="dialog-btn dialog-btn--secondary agent-api-icon-btn"
            disabled={busy}
            onClick={() => void copy(setup.script)}
            aria-label={setup.copyLabel}
            data-tooltip={setup.copyLabel}
          >
            <CopySvgIcon size={13} />
          </button>
          <button
            type="button"
            className="dialog-btn agent-api-primary agent-api-icon-btn"
            disabled={busy || !keyConfigured}
            onClick={() => void runSetup()}
            aria-label={setup.runLabel}
            data-tooltip={
              keyConfigured
                ? `${setup.runLabel} (automatically uses your saved API key)`
                : "Generate or save an API key first"
            }
          >
            <AgentApiTerminalRunIcon size={13} />
          </button>
        </div>
      </div>
      <pre className="agent-api-command">
        <code>{setup.script}</code>
      </pre>
    </section>

    <AgentApiSkillsSection busy={busy} skills={skills} onToggleSkill={onToggleSkill} />

    <section className="agent-api-panel agent-api-notes" aria-label="Agent integration notes">
      <strong>Using the skill &amp; slash commands</strong>
      <ul>
        <li>
          <strong>Claude Code &amp; Antigravity:</strong> type <code>/quotashift-rotation</code> in
          chat (or ask naturally to check quota or switch accounts).
        </li>
        <li>
          <strong>Codex:</strong> invoke explicitly with <code>$quotashift-rotation</code> or pick
          it from <code>/skills</code>.
        </li>
        <li>
          <strong>OpenCode:</strong> run <code>/skills</code> to view loaded skills, or mention{" "}
          <code>quotashift-rotation</code> in your prompt. For manual <code>opencode.jsonc</code>{" "}
          config, merge <code>{'{"skills": ["~/.config/opencode/skills"]}'}</code>.
        </li>
        <li>
          Agents must inherit <code>QUOTASHIFT_AGENT_API_URL</code> and{" "}
          <code>QUOTASHIFT_AGENT_API_KEY</code>. Keys are never written into skill files, and
          switching off removes only unmodified QuotaShift-managed skills.
        </li>
      </ul>
    </section>
  </>
);
