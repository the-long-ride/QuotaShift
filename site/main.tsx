import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles.css";
import "./styles/site-layout.css";
import "./styles/site-hero.css";
import "./styles/site-demo-stage.css";
import "./styles/site-taskbar-stage.css";
import {
  CODEX_MODEL_ROUTING_KEY,
  saveCodexModelRoutingPreference,
} from "../src/utils/common/settings/codex-model-routing";
import {
  CLAUDE_RESET_CREDITS_ENABLED_KEY,
  saveClaudeResetCreditsEnabled,
} from "../src/utils/claude/claude-reset-credits";
import { SiteApp } from "./SiteApp";

try {
  if (localStorage.getItem(CODEX_MODEL_ROUTING_KEY) === null) {
    saveCodexModelRoutingPreference(true);
  }
  if (localStorage.getItem(CLAUDE_RESET_CREDITS_ENABLED_KEY) === null) {
    saveClaudeResetCreditsEnabled(true);
  }
} catch {
  // Ignore storage restrictions in private browsing contexts.
}

const rootEl = document.getElementById("site-root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <SiteApp />
    </StrictMode>,
  );
}
