import React from "react";
import { CommonSwitch } from "../CommonSwitch";

export interface AgentSkillTargetStatus {
  id: string;
  name: string;
  path: string;
  installed: boolean;
}

interface AgentSkillUiMeta {
  id: string;
  name: string;
  defaultPath: string;
  command: string;
  hint: string;
}

const AGENT_SKILL_META: AgentSkillUiMeta[] = [
  {
    id: "claude",
    name: "Claude Code",
    defaultPath: "~/.claude/skills/quotashift-rotation",
    command: "/quotashift-rotation",
    hint: "Type /quotashift-rotation in chat",
  },
  {
    id: "codex",
    name: "Codex",
    defaultPath: "~/.agents/skills/quotashift-rotation",
    command: "$quotashift-rotation",
    hint: "Type $quotashift-rotation or /skills",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    defaultPath: "~/.gemini/config/skills/quotashift-rotation",
    command: "/quotashift-rotation",
    hint: "Type /quotashift-rotation in chat",
  },
  {
    id: "opencode",
    name: "OpenCode",
    defaultPath: "~/.config/opencode/skills/quotashift-rotation",
    command: "/skills",
    hint: "Run /skills in TUI to load quotashift-rotation",
  },
];

interface AgentApiSkillsSectionProps {
  busy: boolean;
  skills: AgentSkillTargetStatus[];
  onToggleSkill: (agentId: string, install: boolean) => Promise<void>;
}

/**
 * Per-agent install/uninstall toggles and quick invocation commands
 * for all supported AI coding agents.
 */
export const AgentApiSkillsSection: React.FC<AgentApiSkillsSectionProps> = ({
  busy,
  skills,
  onToggleSkill,
}) => {
  const byId = new Map(skills.map((item) => [item.id, item]));

  return (
    <section className="agent-api-section" aria-labelledby="agent-api-skills">
      <h3 id="agent-api-skills">Agent skills</h3>
      <p>
        Switch each AI agent on to install the managed <code>quotashift-rotation</code> skill, or
        off to remove it.
      </p>
      <div className="agent-api-skill-list">
        {AGENT_SKILL_META.map((meta) => {
          const live = byId.get(meta.id);
          const installed = live?.installed ?? false;
          const displayPath = live?.path || meta.defaultPath;
          return (
            <div key={meta.id} className="agent-api-skill-row">
              <div className="agent-api-skill-info">
                <div className="agent-api-skill-head">
                  <strong>{live?.name ?? meta.name}</strong>
                  <code className="agent-api-skill-cmd" title={meta.hint}>
                    {meta.command}
                  </code>
                </div>
                <span className="agent-api-skill-path">{displayPath}</span>
              </div>
              <CommonSwitch
                checked={installed}
                onToggle={() => void onToggleSkill(meta.id, !installed)}
                disabled={busy}
                ariaLabel={`${installed ? "Uninstall" : "Install"} ${meta.name} skill`}
                tooltip={
                  installed
                    ? `Uninstall managed skill for ${meta.name} (${meta.hint})`
                    : `Install managed skill for ${meta.name} (${meta.hint})`
                }
              />
            </div>
          );
        })}
      </div>
    </section>
  );
};
