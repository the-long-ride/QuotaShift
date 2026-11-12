import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");

test("agent API dialog matches shared styles and accessible switch conventions", () => {
  const ui = read("src/components/common/agent-api/AgentApiSettings.tsx");
  const css = read("src/styles/settings/agent-api.css");
  assert.match(ui, /AgentApiIcon/);
  assert.match(ui, /AgentApiConfigureIcon/);
  assert.match(ui, /className="dialog-btn agent-api-primary"/);
  assert.match(ui, /<CommonSwitch/);
  assert.doesNotMatch(ui, /type="checkbox"/);
  assert.match(ui, /useCloseOnEscape\(open, close\)/);
  assert.match(ui, /className="agent-api-panel agent-api-notes"/);
  assert.match(css, /\.dialog-box\.agent-api-modal/);
  assert.match(css, /text-align: left/);
  assert.match(css, /overflow-y: auto/);
});

test("PowerShell setup prompts for key and chooses process/user variables without modifying PATH", () => {
  const setup = read("src/components/common/agent-api/agentApiPowerShellSetup.ts");
  assert.match(setup, /Read-Host 'Enter your QuotaShift Agent API key' -AsSecureString/);
  assert.match(setup, /persistent \? "User" : "Process"/);
  assert.match(setup, /SetEnvironmentVariable/);
  assert.match(setup, /ZeroFreeBSTR/);
  assert.doesNotMatch(setup, /SetEnvironmentVariable\('PATH'/i);
  assert.doesNotMatch(setup, /setx /i);
  const ui = read("src/components/common/agent-api/AgentApiSettings.tsx");
  assert.match(ui, /Copy PowerShell environment setup/);
  assert.match(ui, /readable text/);
  assert.match(ui, /This does not modify PATH/);
});
