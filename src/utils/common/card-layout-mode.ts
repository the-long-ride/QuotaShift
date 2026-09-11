export type CardLayoutMode = "compact" | "expanded";

export const CARD_LAYOUT_MODE_KEY = "quotashift_card_layout_mode";

export function loadCardLayoutModePreference(storage: Storage = localStorage): CardLayoutMode {
  const saved = storage.getItem(CARD_LAYOUT_MODE_KEY);
  return saved === "compact" ? "compact" : "expanded";
}

export function saveCardLayoutModePreference(
  mode: CardLayoutMode,
  storage: Storage = localStorage,
): void {
  storage.setItem(CARD_LAYOUT_MODE_KEY, mode);
}

export function formatCompactLimitLabel(label: string | null | undefined): string {
  if (!label) return "";
  const lower = label.toLowerCase().trim();
  if (
    lower.includes("5") ||
    lower.includes("hour") ||
    lower.includes("hr") ||
    lower.includes("session") ||
    lower.includes("primary")
  ) {
    return "5HR";
  }
  if (
    lower.includes("week") ||
    lower.includes("7") ||
    lower.includes("wk") ||
    lower.includes("secondary")
  ) {
    return "WK";
  }
  if (lower.includes("month") || lower.includes("mo") || lower.includes("30")) {
    return "MO";
  }
  if (lower.includes("day") || lower.includes("daily")) {
    return "DAY";
  }
  if (lower.includes("year") || lower.includes("annual")) {
    return "YR";
  }
  return label;
}

export function formatCompactTierName(raw: string | null | undefined): string {
  if (!raw) return "";
  const lower = raw.toLowerCase().trim();
  if (lower.includes("local")) return "LOCAL";
  if (lower.includes("ultra")) return "ULTRA";
  if (lower.includes("plus")) return "PLUS";
  if (
    /\bpro\b/.test(lower) ||
    lower.includes("pro-tier") ||
    lower.includes("google ai pro") ||
    lower.includes("ai pro") ||
    lower === "pro"
  ) {
    return "PRO";
  }
  if (lower.includes("team")) return "TEAM";
  if (lower.includes("free")) return "FREE";
  if (lower.includes("standard") || lower.includes("paid")) return "PAID";
  if (lower.includes("legacy")) return "LEGACY";
  if (lower.includes("api")) return "API";
  if (lower.includes("enterprise") || lower.includes("ent")) return "ENT";
  return raw.toUpperCase();
}

