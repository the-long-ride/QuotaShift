import { type ClaudeDisplayTier } from "./claude-tier-summary.js";

/**
 * Builds a concise multiline tooltip comparing a Claude plan badge against
 * individual Claude Pro (1x baseline).
 */
export function buildClaudeTierTooltip(
  displayTier: ClaudeDisplayTier | string,
  rateLimitTier?: string | null,
): string {
  switch (displayTier) {
    case "FREE":
      return "Claude Free (~0.2x Pro)\nLimited models & usage · No Claude Code access";
    case "PRO":
      return "Claude Pro (1x baseline)\nRolling 5h + weekly caps · Includes Claude Code";
    case "STD":
      return "Claude Team Standard (1.25x Pro / seat)\nPer-seat 5h + weekly caps · Team workspace & Claude Code";
    case "PRE":
      return "Claude Team Premium (6.25x Pro / seat)\n5x Team Standard · High-capacity Claude Code";
    case "TEAM": {
      const hasOpaqueTier = Boolean(rateLimitTier?.trim());
      const detail = hasOpaqueTier
        ? "Per-seat limits · Exact seat tier not reported by CLI"
        : "Per-seat 5h + weekly caps · Seat tier unavailable";
      return `Claude Team (Std 1.25x · Pre 6.25x vs. Pro)\n${detail}`;
    }
    case "Max 5x":
      return "Claude Max 5x (5x Pro)\n5x Pro 5h + weekly capacity · Priority access";
    case "Max 20x":
      return "Claude Max 20x (20x Pro)\n20x Pro 5h + weekly capacity · Highest individual tier";
    case "MAX":
      return "Claude Max (5x or 20x Pro)\nHigher 5h + weekly capacity · Priority access";
    case "ENTERPRISE":
      return "Claude Enterprise (1.25x Std / 6.25x Pre vs. Pro)\nOr metered pay-as-you-go · SSO & org controls";
    default:
      return "Claude Code account\nUsage windows follow your signed-in plan";
  }
}
