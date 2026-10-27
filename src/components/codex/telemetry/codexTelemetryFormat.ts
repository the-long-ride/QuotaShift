import { TelemetryRange } from "./codexTelemetryTypes";

export function formatCompactTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return Math.round(value).toLocaleString();
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  if (value >= 99.95) return "100%";
  return `${value.toFixed(1)}%`;
}

export function formatBucketLabel(tsSec: number, range: TelemetryRange): string {
  const date = new Date(tsSec * 1000);
  if (range === "24h") {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function computeRates(
  requests: number,
  cacheHitRequests: number,
  inputTokens: number,
  cachedTokens: number,
): { cacheHitRate: number; tokenCacheShare: number } {
  const cacheHitRate = requests > 0 ? Math.min(100, (cacheHitRequests / requests) * 100) : 0;
  const tokenCacheShare = inputTokens > 0 ? Math.min(100, (cachedTokens / inputTokens) * 100) : 0;
  return { cacheHitRate, tokenCacheShare };
}
