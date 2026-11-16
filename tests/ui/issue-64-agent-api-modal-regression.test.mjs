import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");

test("agent API dialog matches shared styles and accessible switch conventions", () => {
  const ui = read("src/components/common/agent-api/AgentApiModal.tsx");
  const css = read("src/styles/settings/agent-api.css");
  assert.match(ui, /AgentApiIcon/);
  const entry = read("src/components/common/agent-api/AgentApiSettings.tsx");
  assert.match(entry, /AgentApiConfigureIcon/);
  assert.match(ui, /agent-api-header-controls/);
  assert.match(ui, /<CommonSwitch[\s\S]*?ariaLabel=\{status\.running \? "Disable Agent API" : "Enable Agent API"\}/);
  assert.match(ui, /<CustomDialog[\s\S]*?Disable Agent API\?/);
  assert.doesNotMatch(ui, /Enable API<\/button>/);
  assert.match(ui, /<CommonSwitch/);
  assert.match(ui, /quotashift_agent_api_write_v2/);
  assert.match(ui, /localStorage\.getItem\(WRITE_KEY\)\s*!==\s*"false"/);
  assert.match(ui, /agent_api_set_key/);
  assert.match(ui, /showAppToast/);
  assert.doesNotMatch(ui, /agent-api-notice|agent-api-error/);
  assert.match(
    read("src/components/common/agent-api/AgentApiKeyPanels.tsx"),
    /Enter custom API key/,
  );
  assert.doesNotMatch(ui, /type="checkbox"/);
  assert.match(ui, /useCloseOnEscape\(!confirmDisable, close\)/);
  assert.match(read("src/components/common/agent-api/AgentApiGuidance.tsx"), /className="agent-api-panel agent-api-notes"/);
  assert.match(ui, /agent-api-state-dot/);
  assert.match(ui, /agent-api-endpoint[\s\S]*?<AgentApiEndpointsReference/);
  const endpointsRef = read(
    "src/components/common/agent-api/AgentApiEndpointsReference.tsx",
  );
  assert.match(endpointsRef, /useState\(false\)/);
  assert.match(endpointsRef, /\/v1\/accounts/);
  assert.match(endpointsRef, /\/v1\/pools/);
  assert.match(endpointsRef, /\/v1\/rotation/);
  assert.match(endpointsRef, /\/v1\/operations\/\{id\}/);
  assert.match(endpointsRef, /Params:/);
  assert.match(endpointsRef, /Sample response/);
  assert.doesNotMatch(endpointsRef, /qs_[A-Za-z0-9]{12,}/);
  assert.match(css, /\.dialog-box\.agent-api-modal/);
  assert.match(css, /\.agent-api-state--online/);
  assert.match(css, /text-align: left/);
  assert.match(css, /overflow-y: auto/);
  assert.match(read("src/components/common/settings/SettingsModal.tsx"), /document\.querySelector\("\.agent-api-overlay"\)/);
});

test("User-scope setup prompts for key on Windows, macOS, and Linux without modifying PATH", () => {
  const setup = read("src/components/common/agent-api/agentApiPowerShellSetup.ts");
  assert.match(setup, /Read-Host 'Enter your QuotaShift Agent API key' -AsSecureString/);
  assert.match(setup, /SetEnvironmentVariable\([^)]*'User'\)/);
  assert.doesNotMatch(setup, /persistent \? "User" : "Process"/);
  assert.match(setup, /ZeroFreeBSTR/);
  assert.doesNotMatch(setup, /SetEnvironmentVariable\('PATH'/i);
  assert.doesNotMatch(setup, /setx /i);
  assert.match(setup, /os === "macos"/);
  assert.match(setup, /launchctl setenv/);
  assert.match(setup, /return "linux"/);
  assert.match(setup, /You can close this window now\./);
  assert.match(setup, /readable\s+text/);
  assert.match(setup, /This does not modify PATH/);
  const ui = read("src/components/common/agent-api/AgentApiGuidance.tsx");
  assert.match(ui, /setup\.copyLabel/);
  assert.match(ui, /setup\.runLabel/);
  assert.match(ui, /<CopySvgIcon/);
  assert.match(ui, /<AgentApiTerminalRunIcon/);
  assert.doesNotMatch(ui, /<CommonSwitch/);
});

test("Agent skills section renders switch controls per AI agent and slash command usage", () => {
  const modal = read("src/components/common/agent-api/AgentApiModal.tsx");
  const guidance = read("src/components/common/agent-api/AgentApiGuidance.tsx");
  const skillsSection = read(
    "src/components/common/agent-api/AgentApiSkillsSection.tsx",
  );
  assert.match(modal, /agent_api_list_skills/);
  assert.match(modal, /agent_api_set_skill_installed/);
  assert.match(skillsSection, /Claude Code/);
  assert.match(skillsSection, /Codex/);
  assert.match(skillsSection, /Antigravity/);
  assert.match(skillsSection, /OpenCode/);
  assert.match(skillsSection, /<CommonSwitch/);
  assert.match(skillsSection, /\/quotashift-rotation/);
  assert.match(skillsSection, /\$quotashift-rotation/);
  assert.match(skillsSection, /\/skills/);
  assert.match(guidance, /Using the skill &amp; slash commands/);
});
