import React from "react";
import { AntigravityLogo, OpenAILogo } from "../../src/components/common/icons/ModelLogos";
import { ClaudeLogo } from "../../src/components/claude/ClaudeLogo";
import type { DemoCoordinator, DemoSurfaceId } from "../hooks/useDemoCoordinator";

export interface SiteHighlightsProps {
  coord: DemoCoordinator;
}

const JumpArrowIcon: React.FC = () => (
  <svg
    className="qs-jump-btn-arrow"
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3.5 8h9M8.5 4l4 4-4 4" />
  </svg>
);

export const SiteHighlights: React.FC<SiteHighlightsProps> = ({ coord }) => {
  const jumpToDemo = (
    surface: DemoSurfaceId,
    tab?: "antigravity" | "codex" | "claude",
    codexSection?: "accounts" | "pools",
  ) => {
    coord.setActiveSurface(surface);
    if (tab) {
      coord.setActiveTab(tab);
    }
    if (codexSection) {
      coord.setCodexSection(codexSection);
    }
    const demoEl = document.getElementById("demo");
    demoEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section id="about" className="qs-section">
      <div className="qs-section-header">
        <div>
          <h2 className="qs-section-title">Built for uninterrupted coding sessions</h2>
          <p className="qs-section-subtitle">
            One local-first desktop app covering multi-provider quota telemetry, failover routing,
            and non-intrusive HUD surfaces.
          </p>
        </div>
      </div>

      <div className="qs-highlights-grid">
        <article className="qs-highlight-card">
          <div className="qs-highlight-icon">
            <AntigravityLogo size={18} />
          </div>
          <h3 className="qs-highlight-title">Google Antigravity &amp; Multi-Track HUD</h3>
          <p className="qs-highlight-body">
            Monitor 5-hour and weekly quotas across Gemini and Claude/OpenAI families, jump to the
            account with the most remaining headroom, and pin up to three accounts to the Glass/Mono
            Desktop Overlay or docked Windows Taskbar strip.
          </p>
          <div className="qs-highlight-actions">
            <button
              type="button"
              className="qs-jump-btn"
              onClick={() => jumpToDemo("dashboard", "antigravity")}
            >
              <span>Try Antigravity Tab</span>
              <JumpArrowIcon />
            </button>
            <button type="button" className="qs-jump-btn" onClick={() => jumpToDemo("overlay")}>
              <span>Preview HUD</span>
              <JumpArrowIcon />
            </button>
          </div>
        </article>

        <article className="qs-highlight-card">
          <div className="qs-highlight-icon">
            <OpenAILogo size={18} />
          </div>
          <h3 className="qs-highlight-title">ChatGPT Codex &amp; Model Pools</h3>
          <p className="qs-highlight-body">
            Manage OAuth and API Codex accounts with live reset countdowns, discover shared model
            support, and group accounts into local failover routing pools with cache-aware or
            balanced dispatch.
          </p>
          <div className="qs-highlight-actions">
            <button
              type="button"
              className="qs-jump-btn"
              onClick={() => jumpToDemo("dashboard", "codex", "pools")}
            >
              <span>Inspect Model Pools</span>
              <JumpArrowIcon />
            </button>
            <button type="button" className="qs-jump-btn" onClick={() => jumpToDemo("taskbar")}>
              <span>Windows Taskbar</span>
              <JumpArrowIcon />
            </button>
          </div>
        </article>

        <article className="qs-highlight-card">
          <div className="qs-highlight-icon">
            <ClaudeLogo size={18} />
          </div>
          <h3 className="qs-highlight-title">Claude Code Guardrails &amp; Security</h3>
          <p className="qs-highlight-body">
            Watch multiple monitor-only <code>CLAUDE_CONFIG_DIR</code> profiles with independent
            auto-suspend thresholds and resume controls. Backups use AES-256-GCM with OS Keyring
            secrets and an opt-in loopback Agent API.
          </p>
          <div className="qs-highlight-actions">
            <button
              type="button"
              className="qs-jump-btn"
              onClick={() => jumpToDemo("dashboard", "claude")}
            >
              <span>Test Claude Guardrails</span>
              <JumpArrowIcon />
            </button>
          </div>
        </article>
      </div>
    </section>
  );
};
