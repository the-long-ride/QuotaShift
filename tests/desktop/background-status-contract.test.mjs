import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("header removes Ready status indicator and places BackgroundStatusButton left of QuitButton", () => {
  const header = read("src/components/common/header/Header.tsx");
  assert.doesNotMatch(header, /status-indicator|statusText/);
  const bgIdx = header.indexOf("<BackgroundStatusButton");
  const quitIdx = header.indexOf("<QuitButton");
  assert.ok(bgIdx > -1 && quitIdx > -1 && bgIdx < quitIdx);
});

test("BackgroundStatusButton renders two stacked dots on the left for Model Routing and Agent API", () => {
  const button = read("src/components/common/header/BackgroundStatusButton.tsx");
  const dotsIdx = button.indexOf("bg-status-dots");
  const routingIdx = button.indexOf("bg-status-dot--routing");
  const agentIdx = button.indexOf("bg-status-dot--agent");
  const iconIdx = button.indexOf("bg-status-icon");
  assert.ok(dotsIdx > -1 && routingIdx > dotsIdx && agentIdx > routingIdx && iconIdx > agentIdx);
  assert.match(button, /<BackgroundStatusModal/);
});

test("BackgroundStatusModal uses QuotaShift common dialog-overlay, dialog-box, and settings-modal-header", () => {
  const modal = read("src/components/common/header/BackgroundStatusModal.tsx");
  assert.match(modal, /createPortal\(/);
  assert.match(modal, /className="dialog-overlay"/);
  assert.match(modal, /className="dialog-box agent-api-modal bg-status-modal"/);
  assert.match(modal, /className="settings-modal-header agent-api-header"/);
  assert.match(modal, /className="settings-modal-close bg-status-close"/);
});

test("BackgroundStatusModal exposes Model Routing and Agent API summaries, toggles, and Configure actions", () => {
  const modal = read("src/components/common/header/BackgroundStatusModal.tsx");
  const nav = read("src/hooks/app/useAppNavigation.ts");
  assert.match(modal, /aria-label="Model Routing"/);
  assert.match(modal, /aria-label="Agent API"/);
  assert.match(modal, /onToggleModelRouting/);
  assert.match(modal, /onToggleAgentApi/);
  assert.match(modal, /onOpenModelRouting/);
  assert.match(modal, /<AgentApiModal/);
  assert.match(nav, /setActiveTab\("codex"\)/);
  assert.match(nav, /setCodexSection\("pools"\)/);
});

test("BackgroundStatusModal uses Port label for both services and makes enabled ports click-to-copy URLs", () => {
  const modal = read("src/components/common/header/BackgroundStatusModal.tsx");
  const css = read("src/styles/shared/background-status.css");
  assert.doesNotMatch(modal, /<span>Endpoint<\/span>/);
  assert.doesNotMatch(modal, /`Port \$\{agentPort\}`/);
  assert.doesNotMatch(modal, /Listening at/);
  assert.match(modal, /navigator\.clipboard\.writeText/);
  assert.match(modal, /showAppToast/);
  assert.match(modal, /bg-status-port-btn/);
  assert.match(modal, /routerRunning && routerUrl && routerDisplay/);
  assert.match(modal, /agentStatus\.running \?/);
  assert.match(css, /\.bg-status-port-btn\b/);
});

test("BackgroundStatusModal asks for CustomDialog confirmation before turning off Model Routing or Agent API", () => {
  const modal = read("src/components/common/header/BackgroundStatusModal.tsx");
  assert.match(modal, /<CustomDialog/);
  assert.match(modal, /title="Stop Router Server"/);
  assert.match(modal, /title="Disable Agent API\?"/);
  assert.match(modal, /confirmStopRouting/);
  assert.match(modal, /confirmDisableAgent/);
});
