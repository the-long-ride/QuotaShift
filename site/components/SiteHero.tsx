import React from "react";
import { AntigravityLogo, OpenAILogo } from "../../src/components/common/icons/ModelLogos";
import { ClaudeLogo } from "../../src/components/claude/ClaudeLogo";
import { useGithubReleaseDownloads } from "../hooks/useGithubReleaseDownloads";

const REPO_URL = "https://github.com/the-long-ride/QuotaShift";
const RELEASES_URL = "https://github.com/the-long-ride/QuotaShift/releases/latest";

export const SiteHero: React.FC = () => {
  const { formattedCount, loading } = useGithubReleaseDownloads();

  return (
    <section id="top" className="qs-hero">
      <div className="qs-hero-inner">
        <div className="qs-hero-meta-row">
          <div className="qs-hero-eyebrow">
            <span className="qs-status-dot" aria-hidden="true" />
            <span>Tauri v2 · React · Rust · AES-256-GCM + OS Keyring</span>
          </div>

          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="qs-downloads-pill"
            data-testid="github-total-downloads"
            title="Total downloads across GitHub Releases"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 2.5v7.5" />
              <path d="M4.75 7.25 8 10.5l3.25-3.25" />
              <path d="M2.5 13h11" />
            </svg>
            <span>Total downloads</span>
            <strong className="qs-downloads-count">
              {formattedCount ?? (loading ? "…" : "GitHub")}
            </strong>
          </a>
        </div>

        <h1 className="qs-hero-title">
          Quota monitoring &amp; account switching for AI coding tools.
        </h1>

        <p className="qs-hero-subtitle">
          Track 5-hour and weekly quotas, switch accounts in one click, route ChatGPT Codex requests
          across shared Model Pools, and protect Claude Code profiles with auto-suspend guardrails —
          all from a lightweight desktop dashboard, overlay HUD, or Windows taskbar strip.
        </p>

        <div className="qs-provider-badges" aria-label="Supported AI providers">
          <span className="qs-provider-badge">
            <AntigravityLogo size={14} />
            <span>Google Antigravity</span>
          </span>
          <span className="qs-provider-badge">
            <OpenAILogo size={14} />
            <span>ChatGPT Codex</span>
          </span>
          <span className="qs-provider-badge">
            <ClaudeLogo size={14} />
            <span>Claude Code</span>
          </span>
        </div>

        <div className="qs-hero-ctas">
          <a href="#demo" className="qs-btn qs-btn-primary">
            Explore Live Demo
          </a>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="qs-btn qs-btn-secondary"
          >
            Latest Release
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="qs-btn qs-btn-ghost"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
};
