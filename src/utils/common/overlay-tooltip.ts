import type { OverlayAccountData } from "./overlay-types";

export type OverlayHoverZone =
  "avatar" | "tier_platform" | "reset" | "guardrail_five_hour" | "guardrail_weekly" | "other";

export function formatResetExpiry(isoDate: string | number | undefined | null): string {
  if (!isoDate) return "";
  const d =
    typeof isoDate === "number"
      ? new Date(isoDate < 1e11 ? isoDate * 1000 : isoDate)
      : new Date(isoDate);
  if (isNaN(d.getTime())) return "";

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");

  return `${month} ${day} - ${hour}:${minute}`;
}

export function resolveOverlayPlatformName(provider: "antigravity" | "codex" | "claude"): string {
  if (provider === "codex") return "ChatGPT Codex";
  if (provider === "claude") return "Claude Code";
  return "Antigravity";
}

export function getOverlayTooltipText(
  zone: OverlayHoverZone | null,
  data: OverlayAccountData,
  tierText: string,
): string | null {
  if (!zone) return null;

  if (zone === "guardrail_five_hour" && data.claudeGuardrails?.fiveHourEnabled) {
    return `Auto-suspend at ${data.claudeGuardrails.fiveHourThresholdPct}% (5-hour limit).`;
  }

  if (zone === "guardrail_weekly" && data.claudeGuardrails?.weeklyEnabled) {
    return `Auto-suspend at ${data.claudeGuardrails.weeklyThresholdPct}% (weekly limit).`;
  }

  if (zone === "avatar") {
    const aliasName = data.label || "Account";
    const email = data.email || "";
    return email && aliasName ? `${aliasName} - ${email}` : aliasName || email || "Account";
  }

  if (zone === "tier_platform") {
    const platform = resolveOverlayPlatformName(data.provider);
    const tier = (tierText || data.tier || "FREE").toUpperCase();
    return `${platform} - ${tier}`;
  }

  if (zone === "reset") {
    const resetCount = typeof data.resetCount === "number" ? data.resetCount : 0;
    if (data.provider === "claude") return `${resetCount} reset(s) remaining`;
    const expiryStr = formatResetExpiry(data.resetNearestExpiresAt);
    return expiryStr
      ? `${resetCount} reset(s) remaining - nearest expiry at ${expiryStr}`
      : `${resetCount} reset(s) remaining`;
  }

  if (zone === "other") {
    return "Drag to move - Double click to open dashboard.";
  }

  return null;
}

export function detectOverlayHoverZone(el: HTMLElement | null): OverlayHoverZone | null {
  if (!el) return null;
  if (el.closest(".overlay-guardrail-badge--five-hour")) return "guardrail_five_hour";
  if (el.closest(".overlay-guardrail-badge--weekly")) return "guardrail_weekly";
  if (el.closest(".overlay-reset-badge")) return "reset";
  if (el.closest(".overlay-tier-badge") || el.closest(".overlay-provider-badge"))
    return "tier_platform";
  if (el.closest(".overlay-avatar-wrap")) return "avatar";
  if (el.closest(".glass-card")) return "other";
  return null;
}

export interface OverlayTooltipPlacementParams {
  cardRect: { left: number; top: number; width: number; height: number };
  windowPos: { x: number; y: number };
  monitorBounds?: { minX: number; maxX: number; minY: number; maxY: number } | null;
  tooltipWidth?: number;
  tooltipHeight?: number;
  scale?: number;
}

export interface OverlayTooltipPlacementResult {
  placement: "above" | "below";
  x: number;
  y: number;
  cardCenterX: number;
}

export function computeOverlayTooltipPlacement(
  params: OverlayTooltipPlacementParams,
): OverlayTooltipPlacementResult {
  const scale = params.scale || 1;
  const tooltipWidth = params.tooltipWidth ?? 340;
  const tooltipHeight = params.tooltipHeight ?? 38;

  const cardLeft = params.cardRect.left * scale;
  const cardTop = params.cardRect.top * scale;
  const cardWidth = params.cardRect.width * scale;
  const cardHeight = params.cardRect.height * scale;

  const cardScreenX = params.windowPos.x + cardLeft;
  const cardScreenY = params.windowPos.y + cardTop;
  const cardScreenBottom = cardScreenY + cardHeight;
  const cardCenterX = cardScreenX + cardWidth / 2;

  let placement: "above" | "below" = "below";
  let targetY = cardScreenBottom - 4;

  if (params.monitorBounds) {
    const { minY, maxY } = params.monitorBounds;
    const fitsBelow = cardScreenBottom + tooltipHeight <= maxY;

    if (!fitsBelow) {
      placement = "above";
      targetY = cardScreenY - tooltipHeight + 4;
      if (minY !== undefined && targetY < minY) {
        targetY = minY;
      }
    }
  }

  const targetX = cardCenterX - tooltipWidth / 2;

  return {
    placement,
    x: Math.round(targetX),
    y: Math.round(targetY),
    cardCenterX: Math.round(cardCenterX),
  };
}
