import { isArgonPoolModel, isGeminiOnlyPool } from "../../antigravity/quota/antigravity-quota.js";
import { quotaPercentDisplay } from "../settings/quota-percent-mode.js";
import { getUsageTone } from "../accounts/usage-tone.js";
import type { OverlayAccountData } from "../overlay-types.js";

export interface CircleArcPlacement {
  slot: "top-left-exhausted" | "left" | "right";
  band: "single" | "outer" | "inner";
  hasTopPool?: boolean;
  reverseFill?: boolean;
}

export interface CircleArcSegment {
  id: string;
  label: string;
  /** Remaining quota 0..100 used for health coloring (`<20` warning, `<10` critical). */
  remainingPercent: number | null;
  /** Displayed percentage respecting Remaining vs Used preference. */
  displayPercent: number | null;
  /** Fraction `0..1` of the arc filled. */
  fillRatio: number;
  tone: "normal" | "warning" | "critical";
  placement?: CircleArcPlacement;
}

export interface CircleBadgeMetric {
  id: "five" | "weekly" | "mo";
  remainingPercent: number;
  displayPercent: number;
  tone: "normal" | "warning" | "critical";
}

export interface CircleTelemetry {
  segments: CircleArcSegment[];
  badgeMetrics: CircleBadgeMetric[];
  summaryPercent: number | null;
  summaryRemaining: number | null;
  summaryTone: "normal" | "warning" | "critical";
}

const clampPct = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : null;

const minFinite = (values: Array<number | null>): number | null => {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? Math.min(...nums) : null;
};

const toSegment = (
  id: string,
  label: string,
  remainingPercent: number | null,
  showUsed: boolean,
  placement?: CircleArcPlacement,
): CircleArcSegment => {
  const displayPercent = quotaPercentDisplay(remainingPercent, showUsed);
  return {
    id,
    label,
    remainingPercent,
    displayPercent,
    fillRatio: displayPercent === null ? 0 : Math.max(0, Math.min(1, displayPercent / 100)),
    tone: getUsageTone(remainingPercent),
    ...(placement ? { placement } : {}),
  };
};

const buildMultiPoolSegments = (
  rows: NonNullable<OverlayAccountData["quotaRows"]>,
  showUsed: boolean,
): CircleArcSegment[] => {
  const argonRow = rows.find((row) => isArgonPoolModel(row.label));
  const nonArgon = rows.filter((row) => !isArgonPoolModel(row.label));
  const hasTopPool = Boolean(argonRow);
  const geminiRow = nonArgon.find((row) => /gemini/i.test(row.label));
  const secondaryRow =
    nonArgon.find((row) => row !== geminiRow) ?? (geminiRow ? undefined : nonArgon[0]);
  const primaryRow = geminiRow ?? (nonArgon[0] !== secondaryRow ? nonArgon[0] : undefined);

  const segments: CircleArcSegment[] = [];
  if (argonRow) {
    const wkRem = argonRow.weeklyDisabled ? null : clampPct(argonRow.weeklyPercent);
    segments.push(
      toSegment("pool:argon:wk", argonRow.label, wkRem, showUsed, {
        slot: "top-left-exhausted",
        band: "single",
        hasTopPool: true,
        reverseFill: showUsed,
      }),
    );
  }
  const sideEntries: Array<["left" | "right", typeof primaryRow]> = [
    ["left", primaryRow],
    ["right", secondaryRow],
  ];
  for (const [slot, row] of sideEntries) {
    if (!row) continue;
    const fiveRem = row.fiveHourDisabled ? null : clampPct(row.fiveHourPercent);
    const wkRem = row.weeklyDisabled ? null : clampPct(row.weeklyPercent);
    segments.push(
      toSegment(`pool:${slot}:5h`, `${row.label} 5H`, fiveRem, showUsed, {
        slot,
        band: "outer",
        hasTopPool,
      }),
      toSegment(`pool:${slot}:wk`, `${row.label} WK`, wkRem, showUsed, {
        slot,
        band: "inner",
        hasTopPool,
      }),
    );
  }
  return segments;
};

const matchBarPercent = (
  bars: NonNullable<OverlayAccountData["singleBars"]>,
  match: (label: string) => boolean,
): number | null => {
  const found = bars.find((bar) => match(bar.label.trim().toLowerCase()));
  return found && !found.disabled ? clampPct(found.percent) : null;
};

const buildBadgeMetrics = (
  fiveHourRemaining: number | null,
  weeklyRemaining: number | null,
  monthlyRemaining: number | null,
  showUsed: boolean,
): CircleBadgeMetric[] => {
  const make = (id: CircleBadgeMetric["id"], remaining: number): CircleBadgeMetric => ({
    id,
    remainingPercent: remaining,
    displayPercent: quotaPercentDisplay(remaining, showUsed) ?? 0,
    tone: getUsageTone(remaining),
  });
  if (monthlyRemaining !== null && fiveHourRemaining === null && weeklyRemaining === null) {
    return [make("mo", monthlyRemaining)];
  }
  const metrics: CircleBadgeMetric[] = [];
  if (fiveHourRemaining !== null) metrics.push(make("five", fiveHourRemaining));
  if (weeklyRemaining !== null) metrics.push(make("weekly", weeklyRemaining));
  return metrics;
};

/**
 * Computes segmented radial arcs and bottom 5H/WK (or Monthly) badge metrics for a Circle node.
 * Multi-pool Antigravity accounts get one bottleneck arc per pool (Gemini, Claude/OpenAI, Argon);
 * Codex, Claude, and Gemini-only accounts split cleanly into 5H/WK (or single) arcs.
 */
export function buildCircleTelemetry(
  data: Pick<
    OverlayAccountData,
    "provider" | "quotaRows" | "singleBars" | "fiveHourPercent" | "weeklyPercent"
  >,
  showUsed: boolean,
): CircleTelemetry {
  const rows = data.quotaRows ?? [];
  const hasMultiPool =
    rows.length > 0 &&
    !(data.provider === "antigravity" && isGeminiOnlyPool(rows.map((row) => row.label)));

  let segments: CircleArcSegment[];
  let fiveHourRemaining: number | null = null;
  let weeklyRemaining: number | null = null;
  let monthlyRemaining: number | null = null;

  if (hasMultiPool) {
    segments = buildMultiPoolSegments(rows, showUsed);
    fiveHourRemaining = minFinite(
      rows
        .filter((row) => !isArgonPoolModel(row.label))
        .map((row) => (row.fiveHourDisabled ? null : clampPct(row.fiveHourPercent))),
    );
    weeklyRemaining = minFinite(
      rows.map((row) => (row.weeklyDisabled ? null : clampPct(row.weeklyPercent))),
    );
  } else if (data.singleBars && data.singleBars.length > 0) {
    const bars = data.singleBars;
    segments = bars.slice(0, 3).map((bar, index) => {
      const rem = bar.disabled ? null : clampPct(bar.percent);
      return toSegment(`single:${index}`, bar.label, rem, showUsed);
    });
    fiveHourRemaining =
      matchBarPercent(
        bars,
        (l) => l === "5h" || l.includes("5h") || l.includes("5-hour") || l.includes("5 hour"),
      ) ?? clampPct(data.fiveHourPercent);
    weeklyRemaining =
      matchBarPercent(bars, (l) => l === "wk" || l.includes("week")) ??
      clampPct(data.weeklyPercent);
    monthlyRemaining = matchBarPercent(bars, (l) => l === "mo" || l.includes("month"));
  } else {
    const firstRow = rows[0];
    fiveHourRemaining = clampPct(
      firstRow
        ? firstRow.fiveHourDisabled
          ? null
          : firstRow.fiveHourPercent
        : data.fiveHourPercent,
    );
    weeklyRemaining = clampPct(
      firstRow ? (firstRow.weeklyDisabled ? null : firstRow.weeklyPercent) : data.weeklyPercent,
    );
    segments = [toSegment("five", "5H", fiveHourRemaining, showUsed)];
    if (weeklyRemaining !== null) {
      segments.push(toSegment("weekly", "WK", weeklyRemaining, showUsed));
    }
  }

  if (segments.length === 0) {
    segments = [toSegment("empty", "5H", null, showUsed)];
  }

  const allRemaining: Array<number | null> = hasMultiPool
    ? rows.flatMap((row) => [
        row.fiveHourDisabled ? null : clampPct(row.fiveHourPercent),
        row.weeklyDisabled ? null : clampPct(row.weeklyPercent),
      ])
    : segments.map((s) => s.remainingPercent);

  const summaryRemaining = minFinite(allRemaining);
  const summaryPercent = quotaPercentDisplay(summaryRemaining, showUsed);
  return {
    segments,
    badgeMetrics: buildBadgeMetrics(fiveHourRemaining, weeklyRemaining, monthlyRemaining, showUsed),
    summaryPercent,
    summaryRemaining,
    summaryTone: getUsageTone(summaryRemaining),
  };
}
