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
  assert.match(ui, /className="dialog-btn agent-api-primary"/);
  assert.match(ui, /<CommonSwitch/);
  assert.match(read("src/components/common/agent-api/AgentApiGuidance.tsx"), /<CommonSwitch/);
  assert.doesNotMatch(ui, /type="checkbox"/);
  assert.match(ui, /useCloseOnEscape\(true, close\)/);
  assert.match(read("src/components/common/agent-api/AgentApiGuidance.tsx"), /className="agent-api-panel agent-api-notes"/);
  assert.match(css, /\.dialog-box\.agent-api-modal/);
  assert.match(css, /text-align: left/);
  assert.match(css, /overflow-y: auto/);
  assert.match(read("src/components/common/settings/SettingsModal.tsx"), /document\.querySelector\("\.agent-api-overlay"\)/);
});

test("PowerShell setup prompts for key and chooses process/user variables without modifying PATH", () => {
  const setup = read("src/components/common/agent-api/agentApiPowerShellSetup.ts");
  assert.match(setup, /Read-Host 'Enter your QuotaShift Agent API key' -AsSecureString/);
  assert.match(setup, /persistent \? "User" : "Process"/);
  assert.match(setup, /SetEnvironmentVariable/);
  assert.match(setup, /ZeroFreeBSTR/);
  assert.doesNotMatch(setup, /SetEnvironmentVariable\('PATH'/i);
  assert.doesNotMatch(setup, /setx /i);
  const ui = read("src/components/common/agent-api/AgentApiGuidance.tsx");
  assert.match(ui, /Copy PowerShell environment setup/);
  assert.match(ui, /readable text/);
  assert.match(ui, /This does not modify PATH/);
});
