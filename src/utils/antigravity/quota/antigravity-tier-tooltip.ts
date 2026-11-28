import type { AntigravityTier } from "./antigravity-tier-summary.js";

const MAX_TOOLTIP_MODELS = 4;

function formatObservedModels(models?: readonly string[] | null): string | null {
  if (!models || models.length === 0) return null;
  const cleaned = Array.from(new Set(models.map((item) => item.trim()).filter(Boolean)));
  if (cleaned.length === 0) return null;
  if (cleaned.length <= MAX_TOOLTIP_MODELS) return cleaned.join(", ");
  const shown = cleaned.slice(0, MAX_TOOLTIP_MODELS).join(", ");
  return `${shown} +${cleaned.length - MAX_TOOLTIP_MODELS} more`;
}

export function buildAntigravityTierTooltip(
  tier: AntigravityTier,
  premiumModels?: readonly string[] | null,
): string {
  const observed = formatObservedModels(premiumModels);

  if (tier === "FREE") {
    return [
      "Google AI Free",
      "Baseline weekly agent quota (no 5h refill)",
      "Standard Gemini models",
    ].join("\n");
  }

  if (tier === "PLUS") {
    return [
      "Google AI Plus",
      "~2× Free Gemini limits · weekly agent quota",
      "Standard Gemini models",
    ].join("\n");
  }

  if (tier === "PRO+") {
    return [
      "Google AI PRO+ (1× Pro limits + next-gen models)",
      "5-hour rolling refills + weekly cap",
      observed ? `Models: ${observed}` : "Next-gen Gemini models detected",
    ].join("\n");
  }

  if (tier === "ULTRA") {
    const lines = [
      "Google AI Ultra (5×–20× Pro limits: Ultra 5× / 20×)",
      "Highest 5-hour & weekly caps · priority traffic",
    ];
    if (observed) lines.push(`Models: ${observed}`);
    return lines.join("\n");
  }

  if (tier === "ENTERPRISE") {
    const lines = ["Google AI Enterprise", "Organization-managed agent quotas & admin controls"];
    if (observed) lines.push(`Models: ${observed}`);
    return lines.join("\n");
  }

  return [
    "Google AI Pro (1× paid baseline)",
    "5-hour rolling refills + weekly cap",
    Array.isArray(premiumModels)
      ? "No next-gen models in last fetch"
      : "Refresh quota to check next-gen models",
  ].join("\n");
}
