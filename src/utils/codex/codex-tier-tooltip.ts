import type { CodexTier } from "./codex-tier-summary.js";

const CODEX_TIER_TOOLTIPS: Record<CodexTier, string> = {
  FREE: "ChatGPT Free\nNo premium models (minimal introductory Codex).\n~0.5x Go (~0.25x Plus baseline) · 1-month usage cap.",
  GO: "ChatGPT Go\nNo premium models (lightweight Codex access).\n~2x Free limits · 1-month usage cap (like Free).",
  PLUS: "ChatGPT Plus (1x baseline)\nFull Codex access across CLI, IDE, Web, and Cloud.\n1x baseline shared pool (5h rolling + weekly limits).",
  Pro5x:
    "ChatGPT Pro (Pro5x)\n5x Plus baseline capacity (Pro-Lite tier).\nNo 5h rolling cap (weekly usage pool only).",
  Pro20x:
    "ChatGPT Pro (Pro20x)\n20x Plus baseline capacity.\nNo 5h rolling cap (weekly usage pool only).",
  Pro50x:
    "ChatGPT Pro (Pro50x)\n50x Plus baseline capacity with full Ultrafast mode.\nNo 5h rolling cap (highest individual Codex ceiling).",
  STD: "ChatGPT Business Standard\n~1x Plus Codex allowance per seat in a shared workspace.\n5h rolling + weekly limits with workspace admin controls.",
  PRE: "ChatGPT Business Premium\n5x Business Standard capacity per seat.\nNo 5h rolling cap (weekly workspace pool only).",
  ENTERPRISE:
    "ChatGPT Enterprise\nOrg-managed workspace with SSO, compliance & admin controls.\nCustom or credit-based shared Codex usage limits.",
  EDU: "ChatGPT Edu\nAcademic workspace with privacy controls & Codex access.\nWorkspace-managed shared usage limits.",
  API: "OpenAI Platform API (Pay-as-you-go)\nDirect api.openai.com per-token billing & tier RPM/TPM limits.\nSeparate from ChatGPT subscription usage pools.",
};

export function buildCodexTierTooltip(tier: CodexTier): string {
  return CODEX_TIER_TOOLTIPS[tier] ?? CODEX_TIER_TOOLTIPS.FREE;
}
