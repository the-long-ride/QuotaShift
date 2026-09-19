import React, { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import appPackage from "../../../package.json";
import { CopySvgIcon } from "./CopySvgIcon";

const AUTHOR_URL = "https://github.com/the-long-ride";
const REPO_URL = "https://github.com/the-long-ride/QuotaShift";
const ISSUES_URL = `${REPO_URL}/issues`;
export const LLM_GUIDE_LATEST_URL = `${REPO_URL}/blob/main/llm.txt`;
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;

export const normalizeAppVersion = (version: string) =>
  version.trim().replace(/^v/i, "") || appPackage.version;

export const buildVersionedLlmGuideUrl = (version: string) =>
  `${REPO_URL}/blob/v${normalizeAppVersion(version)}/llm.txt`;

export const buildVersionReleaseUrl = (version: string) =>
  `${REPO_URL}/releases/tag/v${normalizeAppVersion(version)}`;

export const buildAiSupportPrompt = (rawVersion: string) => {
  const version = normalizeAppVersion(rawVersion);
  return `I am using QuotaShift v${version}.

Use the exact-version support guide first:
${buildVersionedLlmGuideUrl(version)}

If that exact-version guide is unavailable, check the exact release page:
${buildVersionReleaseUrl(version)}

Then use the latest/main guide only as fallback context:
${LLM_GUIDE_LATEST_URL}

Compare fallback information against the changelog:
${CHANGELOG_URL}

Version-safety rules:
- My installed version (v${version}) is authoritative.
- Do not assume features from latest/main exist in my installed version.
- If documentation versions conflict, prefer exact v${version} release/tag information.
- Clearly identify anything that is not verified for v${version}.

I need help with:
[DESCRIBE WHAT YOU WANT TO ASK OR DO HERE]

Give me step-by-step instructions based on features verified for my version.
If troubleshooting, tell me what sanitized Settings/Logs details to share.
Do not ask me for passwords, tokens, cookies, backup secrets, or other credentials.`;
};

export const buildIssueTemplate = (rawVersion: string) => {
  const version = normalizeAppVersion(rawVersion);
  return `Type: Bug / Feature Request
QuotaShift version: v${version}
OS:
Provider/area: Antigravity / ChatGPT Codex / Claude Code / Overlay / Settings / Other

What happened / what I want:
[Describe the bug or feature request]

Steps to reproduce (for bugs):
1.
2.
3.

Expected behavior:
Actual behavior:
Relevant sanitized logs:
Additional context:`;
};

export const HelpSettingsSection: React.FC = () => {
  const [installedVersion, setInstalledVersion] = useState(() =>
    normalizeAppVersion(appPackage.version),
  );
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedIssue, setCopiedIssue] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getVersion()
      .then((version) => {
        if (!cancelled) setInstalledVersion(normalizeAppVersion(version));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const aiSupportPrompt = buildAiSupportPrompt(installedVersion);
  const issueTemplate = buildIssueTemplate(installedVersion);

  const copyText = async (
    value: string,
    setCopied: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy help text:", error);
    }
  };

  const openExternal = (url: string) => void openUrl(url);

  return (
    <div className="settings-section help-settings-section">
      <div className="settings-section-title">Help</div>

      <div className="help-intro-row">
        <span className="help-row-title">Ask any AI chatbot</span>
        <span className="help-row-description">
          Copy this prompt, replace the placeholder with what you want help with, then send it to
          your preferred AI chatbot.
        </span>
      </div>

      <div className="help-copy-card">
        <div className="help-card-header">
          <div>
            <div className="help-card-title">Example support prompt</div>
            <div className="help-card-description">
              Includes your installed version (v{installedVersion}), an exact-release guide link,
              and a safe fallback for version mismatches.
            </div>
          </div>
          <button
            type="button"
            className="logs-copy-button"
            onClick={() => void copyText(aiSupportPrompt, setCopiedPrompt)}
            data-tooltip={copiedPrompt ? "Copied!" : "Copy AI support prompt"}
            aria-label="Copy AI support prompt"
          >
            <CopySvgIcon size={14} />
          </button>
        </div>
        <pre className="help-code-block">{aiSupportPrompt}</pre>
      </div>

      <div className="help-project-row">
        <span className="help-project-label">Project</span>
        <div className="help-project-links">
          <button
            type="button"
            className="help-link-button"
            onClick={() => openExternal(AUTHOR_URL)}
            data-tooltip="Open author GitHub profile"
          >
            Author: the-long-ride
          </button>
          <button
            type="button"
            className="help-link-button"
            onClick={() => openExternal(REPO_URL)}
            data-tooltip="Open QuotaShift source repository"
          >
            Source
          </button>
          <button
            type="button"
            className="help-link-button"
            onClick={() => openExternal(ISSUES_URL)}
            data-tooltip="Open QuotaShift issues"
          >
            Issues
          </button>
        </div>
      </div>

      <div className="help-copy-card">
        <div className="help-card-header">
          <div>
            <div className="help-card-title">Quick issue template</div>
            <div className="help-card-description">
              Copy this before opening Issues to report a bug or request a feature quickly.
            </div>
          </div>
          <button
            type="button"
            className="logs-copy-button"
            onClick={() => void copyText(issueTemplate, setCopiedIssue)}
            data-tooltip={copiedIssue ? "Copied!" : "Copy issue template"}
            aria-label="Copy issue template"
          >
            <CopySvgIcon size={14} />
          </button>
        </div>
        <pre className="help-code-block help-code-block--issue">{issueTemplate}</pre>
      </div>
    </div>
  );
};
