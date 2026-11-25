const DEFAULT_AGENT_API_PORT = 45692;

const status: {
  running: boolean;
  port: number | null;
  writeEnabled: boolean;
  keyConfigured: boolean;
} = {
  running: true,
  port: DEFAULT_AGENT_API_PORT,
  writeEnabled: true,
  keyConfigured: true,
};

const skills = [
  {
    id: "claude",
    name: "Claude Code",
    path: "~/.claude/skills/quotashift-rotation",
    installed: true,
  },
  {
    id: "codex",
    name: "Codex",
    path: "~/.agents/skills/quotashift-rotation",
    installed: true,
  },
  {
    id: "antigravity",
    name: "Antigravity",
    path: "~/.gemini/config/skills/quotashift-rotation",
    installed: true,
  },
  {
    id: "opencode",
    name: "OpenCode",
    path: "~/.config/opencode/skills/quotashift-rotation",
    installed: false,
  },
];

export function handleDemoAgentApiInvoke(
  cmd: string,
  args?: Record<string, unknown>,
): { handled: true; value: unknown } | { handled: false } {
  switch (cmd) {
    case "agent_api_status":
      return { handled: true, value: { ...status } };
    case "agent_api_start":
      status.running = true;
      status.port =
        typeof args?.port === "number" ? args.port : (status.port ?? DEFAULT_AGENT_API_PORT);
      status.writeEnabled =
        typeof args?.writeEnabled === "boolean" ? args.writeEnabled : status.writeEnabled;
      return { handled: true, value: null };
    case "agent_api_stop":
      status.running = false;
      return { handled: true, value: null };
    case "agent_api_generate_key":
      status.keyConfigured = true;
      return { handled: true, value: "qs_live_demo_9f4a2c8e1b7d3065a4c2" };
    case "agent_api_set_key":
      status.keyConfigured = true;
      return { handled: true, value: null };
    case "agent_api_run_env_setup":
      return { handled: true, value: null };
    case "agent_api_list_skills":
      return { handled: true, value: skills.map((s) => ({ ...s })) };
    case "agent_api_set_skill_installed": {
      const targetId = typeof args?.agentId === "string" ? args.agentId : "";
      for (const skill of skills) {
        if (skill.id === targetId) {
          skill.installed = Boolean(args?.installed);
        }
      }
      return { handled: true, value: skills.map((s) => ({ ...s })) };
    }
    default:
      return { handled: false };
  }
}
