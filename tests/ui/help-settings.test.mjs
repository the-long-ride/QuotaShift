import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("root llm.txt documents QuotaShift for AI-assisted end-user support", () => {
  const guide = read("llm.txt");
  const appPackage = JSON.parse(read("package.json"));

  assert.match(guide, /QuotaShift — AI Support Guide/);
  assert.equal(
    guide.includes("Guide verified against app version: " + appPackage.version),
    true,
    "llm.txt verified version must match package.json",
  );
  assert.match(guide, /VERSION COMPATIBILITY — READ THIS FIRST/);
  assert.match(guide, /Exact-version guide pattern:/);
  assert.match(guide, /user's installed QuotaShift version as authoritative/);
  assert.match(guide, /If the exact tagged guide does not exist/);
  assert.match(guide, /GOOGLE ANTIGRAVITY/);
  assert.match(guide, /CHATGPT CODEX/);
  assert.match(guide, /CLAUDE CODE/);
  assert.match(guide, /Claude visibility rule:/);
  assert.match(guide, /Desktop Overlay/);
  assert.match(guide, /SETTINGS/);
  assert.match(guide, /SECURITY AND PRIVACY/);
  assert.match(guide, /BACKUP AND RESTORE/);
  assert.match(guide, /LOGGING AND TROUBLESHOOTING/);
  assert.match(guide, /BETTER USER EXPERIENCE TIPS/);
  assert.match(guide, /AI ASSISTANT SUPPORT INSTRUCTIONS/);
  assert.match(guide, /https:\/\/github\.com\/the-long-ride\/QuotaShift\/issues/);
});

test("Settings Help tab renders version-safe AI support and issue copy actions", () => {
  const modal = read("src/components/common/SettingsModal.tsx");
  const types = read("src/components/common/settings-types.ts");
  const section = read("src/components/common/HelpSettingsSection.tsx");
  const styles = read("src/styles/settings/help-settings.css");
  const imports = read("src/styles.css");

  assert.match(modal, /\["help",\s*"Help"\]/);
  assert.match(modal, /activeTab === "help"/);
  assert.match(modal, /<HelpSettingsSection \/>/);
  assert.match(types, /"help"/);

  assert.match(section, /getVersion/);
  assert.match(section, /normalizeAppVersion/);
  assert.match(section, /Copy this prompt, replace the placeholder/);
  assert.match(section, /\[DESCRIBE WHAT YOU WANT TO ASK OR DO HERE\]/);
  assert.match(section, /buildVersionedLlmGuideUrl/);
  assert.match(section, /blob\/v/);
  assert.match(section, /llm\.txt/);
  assert.match(section, /buildVersionReleaseUrl/);
  assert.match(section, /LLM_GUIDE_LATEST_URL/);
  assert.match(section, /CHANGELOG_URL/);
  assert.match(section, /My installed version/);
  assert.match(section, /Do not assume features from latest\/main exist in my installed version/);
  assert.match(section, /buildIssueTemplate\(installedVersion\)/);
  assert.match(section, /buildAiSupportPrompt\(installedVersion\)/);
  assert.match(section, /navigator\.clipboard\.writeText/);
  assert.equal((section.match(/className="logs-copy-button"/g) ?? []).length, 2);
  assert.match(section, /Author: the-long-ride/);
  assert.match(section, /https:\/\/github\.com\/the-long-ride"/);
  assert.match(section, /https:\/\/github\.com\/the-long-ride\/QuotaShift"/);
  assert.match(section, /const ISSUES_URL/);
  assert.match(section, /Type: Bug \/ Feature Request/);
  assert.match(section, /Relevant sanitized logs:/);
  assert.doesNotMatch(section, /<button[^>]*\btitle=/);

  assert.match(imports, /@import "\.\/styles\/settings\/help-settings\.css";/);
  assert.match(styles, /\.help-code-block/);
  assert.match(styles, /\.help-project-row/);
  assert.match(styles, /\.help-link-button/);
});
