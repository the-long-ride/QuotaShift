import {
  computeRates,
  formatBucketLabel,
  formatCompactTokens,
  formatPercent,
} from "./codexTelemetryFormat";

export { formatCompactTokens, formatPercent };

export interface ModelUsageTotals {
  model: string;
  requests: number;
  cacheHitRequests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
}

export interface TelemetryBucket {
  timestamp: number;
  requests: number;
  cacheHitRequests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  byModel: Record<string, ModelUsageTotals>;
}

export interface RouterTelemetryReport {
  generatedAt: number;
  totalRequests: number;
  cacheHitRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalReasoningTokens: number;
  hourlyBuckets: TelemetryBucket[];
  byModel: ModelUsageTotals[];
}

export type TelemetryRange = "24h" | "7d" | "30d" | "90d" | "all";

export interface TelemetryRangeOption {
  id: TelemetryRange;
  label: string;
}

export const TELEMETRY_RANGES: TelemetryRangeOption[] = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "90d", label: "90 Days" },
  { id: "all", label: "All Time" },
];

export interface AggregatedPoint {
  label: string;
  startTs: number;
  endTs: number;
  requests: number;
  cacheHitRequests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cacheHitRate: number;
  tokenCacheShare: number;
}

export interface PeriodSummary {
  range: TelemetryRange;
  requests: number;
  cacheHitRequests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cacheHitRatePercent: number;
  tokenCacheSharePercent: number;
  points: AggregatedPoint[];
  byModel: ModelUsageTotals[];
}

export function buildTelemetryPeriodSummary(
  report: RouterTelemetryReport,
  range: TelemetryRange,
  nowSecInput?: number,
): PeriodSummary {
  const nowSec =
    nowSecInput ?? (report.generatedAt > 0 ? report.generatedAt : Math.floor(Date.now() / 1000));
  const currentHour = nowSec - (((nowSec % 3600) + 3600) % 3600);

  const rangeConfig: Record<
    Exclude<TelemetryRange, "all">,
    { spanHours: number; stepHours: number }
  > = {
    "24h": { spanHours: 24, stepHours: 1 },
    "7d": { spanHours: 7 * 24, stepHours: 6 },
    "30d": { spanHours: 30 * 24, stepHours: 24 },
    "90d": { spanHours: 90 * 24, stepHours: 72 },
  };

  const buckets = report.hourlyBuckets ?? [];
  const points: AggregatedPoint[] = [];

  if (range === "all") {
    const stepHours = buckets.length > 30 ? 72 : 24;
    const spanHours = Math.max(
      24,
      Math.min(90 * 24, Math.ceil(Math.max(buckets.length, 24) / stepHours) * stepHours),
    );
    const count = Math.max(12, Math.floor(spanHours / stepHours));
    const stepSec = stepHours * 3600;
    const startBase = currentHour - (count - 1) * stepSec;
    for (let i = 0; i < count; i++) {
      const startTs = startBase + i * stepSec;
      points.push(aggregateWindow(buckets, startTs, startTs + stepSec, "all"));
    }
    const { cacheHitRate, tokenCacheShare } = computeRates(
      report.totalRequests,
      report.cacheHitRequests,
      report.totalInputTokens,
      report.totalCachedTokens,
    );
    return {
      range,
      requests: report.totalRequests,
      cacheHitRequests: report.cacheHitRequests,
      inputTokens: report.totalInputTokens,
      outputTokens: report.totalOutputTokens,
      cachedTokens: report.totalCachedTokens,
      reasoningTokens: report.totalReasoningTokens,
      totalTokens: report.totalInputTokens + report.totalOutputTokens,
      cacheHitRatePercent: cacheHitRate,
      tokenCacheSharePercent: tokenCacheShare,
      points,
      byModel: [...(report.byModel ?? [])].sort(
        (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
      ),
    };
  }

  const { spanHours, stepHours } = rangeConfig[range];
  const stepSec = stepHours * 3600;
  const count = Math.floor(spanHours / stepHours);
  const cutoffTs = currentHour - (spanHours - stepHours) * 3600;

  for (let i = 0; i < count; i++) {
    const startTs = cutoffTs + i * stepSec;
    points.push(aggregateWindow(buckets, startTs, startTs + stepSec, range));
  }

  const windowBuckets = buckets.filter(
    (b) => b.timestamp >= cutoffTs && b.timestamp < currentHour + stepSec,
  );
  let requests = 0;
  let cacheHitRequests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let reasoningTokens = 0;
  const modelMap = new Map<string, ModelUsageTotals>();

  for (const b of windowBuckets) {
    requests += b.requests;
    cacheHitRequests += b.cacheHitRequests;
    inputTokens += b.inputTokens;
    outputTokens += b.outputTokens;
    cachedTokens += b.cachedTokens;
    reasoningTokens += b.reasoningTokens;
    for (const m of Object.values(b.byModel ?? {})) {
      const prev = modelMap.get(m.model) ?? {
        model: m.model,
        requests: 0,
        cacheHitRequests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
      };
      prev.requests += m.requests;
      prev.cacheHitRequests += m.cacheHitRequests;
      prev.inputTokens += m.inputTokens;
      prev.outputTokens += m.outputTokens;
      prev.cachedTokens += m.cachedTokens;
      prev.reasoningTokens += m.reasoningTokens;
      modelMap.set(m.model, prev);
    }
  }

  const { cacheHitRate, tokenCacheShare } = computeRates(
    requests,
    cacheHitRequests,
    inputTokens,
    cachedTokens,
  );
  const byModel = Array.from(modelMap.values()).sort(
    (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
  );

  return {
    range,
    requests,
    cacheHitRequests,
    inputTokens,
    outputTokens,
    cachedTokens,
    reasoningTokens,
    totalTokens: inputTokens + outputTokens,
    cacheHitRatePercent: cacheHitRate,
    tokenCacheSharePercent: tokenCacheShare,
    points,
    byModel,
  };
}

function aggregateWindow(
  buckets: TelemetryBucket[],
  startTs: number,
  endTs: number,
  range: TelemetryRange,
): AggregatedPoint {
  let requests = 0;
  let cacheHitRequests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let reasoningTokens = 0;
  for (const b of buckets) {
    if (b.timestamp >= startTs && b.timestamp < endTs) {
      requests += b.requests;
      cacheHitRequests += b.cacheHitRequests;
      inputTokens += b.inputTokens;
      outputTokens += b.outputTokens;
      cachedTokens += b.cachedTokens;
      reasoningTokens += b.reasoningTokens;
    }
  }
  const { cacheHitRate, tokenCacheShare } = computeRates(
    requests,
    cacheHitRequests,
    inputTokens,
    cachedTokens,
  );
  return {
    label: formatBucketLabel(startTs, range),
    startTs,
    endTs,
    requests,
    cacheHitRequests,
    inputTokens,
    outputTokens,
    cachedTokens,
    reasoningTokens,
    cacheHitRate,
    tokenCacheShare,
  };
}
