import { formatAbsoluteTime, formatUsageLimitTooltip } from "./format-time.js";

export type ResetProvider = "antigravity" | "codex" | "claude";

/** Epoch seconds or milliseconds to ISO; null when missing or invalid. */
export function epochToIso(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const ms = value > 10_000_000_000 ? value : value * 1000;
  return new Date(ms).toISOString();
}

/** The reset text an account card shows above a bar. "" means the card shows nothing. */
export function formatCardResetLabel(
  provider: ResetProvider,
  resetAt: string | null | undefined,
  disabled = false,
  now: Date = new Date(),
): string {
  if (disabled) return "Disabled";
  if (!resetAt) return provider === "claude" ? "" : "Ready";
  const label = formatAbsoluteTime(resetAt, now);
  return provider === "claude" && label === "—" ? "" : label;
}

/** Overlay short labels (5H, WK, MO) as the cards spell them. */
export function longWindowLabel(short: string): string {
  const key = short.trim().toUpperCase();
  if (key === "5H") return "5 hrs";
  if (key === "WK") return "Weekly";
  if (key === "MO") return "Monthly";
  return short;
}

/** The sentence the dashboard cards show when hovering a usage bar. */
export function formatBarResetTooltip(
  provider: ResetProvider,
  shortLabel: string,
  resetAt: string | null | undefined,
  disabled = false,
  family: string | null = null,
  now: Date = new Date(),
): string {
  const window = longWindowLabel(shortLabel);
  const label = family ? `${family} ${window}` : window;
  return formatUsageLimitTooltip(label, formatCardResetLabel(provider, resetAt, disabled, now));
}
