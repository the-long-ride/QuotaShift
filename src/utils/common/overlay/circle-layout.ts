import type { CircleArcPlacement, CircleArcSegment } from "./circle-telemetry.js";
export {
  buildCircleTelemetry,
  type CircleArcPlacement,
  type CircleArcSegment,
  type CircleBadgeMetric,
  type CircleTelemetry,
} from "./circle-telemetry.js";

export type CircleOrientation = "vertical" | "horizontal";

export const CIRCLE_ORIENTATION_KEY = "quotashift_circle_orientation_v1";
export const CIRCLE_ORIENTATION_EVENT = "circle-orientation-changed";

export interface CircleSvgArc {
  id: string;
  trackPath: string;
  fillPath: string | null;
  tone: "normal" | "warning" | "critical";
  parallel?: boolean;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export const normalizeCircleOrientation = (value: unknown): CircleOrientation =>
  value === "horizontal" ? "horizontal" : "vertical";

export function loadCircleOrientation(
  storage: StorageLike | null = defaultStorage(),
): CircleOrientation {
  try {
    return normalizeCircleOrientation(storage?.getItem(CIRCLE_ORIENTATION_KEY));
  } catch {
    return "vertical";
  }
}

export function saveCircleOrientation(
  orientation: CircleOrientation,
  storage: StorageLike | null = defaultStorage(),
): CircleOrientation {
  const normalized = normalizeCircleOrientation(orientation);
  try {
    storage?.setItem(CIRCLE_ORIENTATION_KEY, normalized);
  } catch {}
  return normalized;
}

const polarPoint = (cx: number, cy: number, radius: number, angleDeg: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Number((cx + radius * Math.cos(rad)).toFixed(2)),
    y: Number((cy + radius * Math.sin(rad)).toFixed(2)),
  };
};

const svgArcPath = (
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
  sweepFlag: 0 | 1 = 1,
): string => {
  const span = Math.abs(endDeg - startDeg);
  const clampedEnd = span >= 360 ? startDeg + (sweepFlag === 1 ? 359.99 : -359.99) : endDeg;
  const start = polarPoint(cx, cy, radius, startDeg);
  const end = polarPoint(cx, cy, radius, clampedEnd);
  const largeArc = span > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${sweepFlag} ${end.x} ${end.y}`;
};

const placedArcPath = (
  seg: CircleArcSegment,
  placement: CircleArcPlacement,
  cx: number,
  cy: number,
  radius: number,
): CircleSvgArc => {
  const { slot, band, hasTopPool = false, reverseFill = false } = placement;
  const bandRadius =
    band === "outer"
      ? radius + 1.2
      : band === "inner"
        ? radius - 2.5
        : hasTopPool
          ? radius - 0.5
          : radius;
  const parallel = band !== "single";
  if (slot === "top-left-exhausted") {
    const startDeg = reverseFill ? 320 : 220;
    const sweepFlag: 0 | 1 = reverseFill ? 0 : 1;
    const dir = reverseFill ? -1 : 1;
    const activeSpan = 100 * seg.fillRatio;
    return {
      id: seg.id,
      trackPath: svgArcPath(cx, cy, bandRadius, 220, 320, 1),
      fillPath:
        activeSpan >= 1.5
          ? svgArcPath(cx, cy, bandRadius, startDeg, startDeg + dir * activeSpan, sweepFlag)
          : null,
      tone: seg.tone,
      parallel,
    };
  }
  const isRight = slot === "right";
  const halfGapPx = radius * Math.sin((9 * Math.PI) / 180);
  const gapDeg = (Math.asin(Math.min(0.95, halfGapPx / bandRadius)) * 180) / Math.PI;
  const startDeg = isRight ? 90 - gapDeg : 90 + gapDeg;
  const endDeg = isRight ? (hasTopPool ? -26 : -90 + gapDeg) : hasTopPool ? 206 : 270 - gapDeg;
  const sweepFlag: 0 | 1 = isRight ? 0 : 1;
  const dir = isRight ? -1 : 1;
  const activeSpan = Math.abs(endDeg - startDeg) * seg.fillRatio;
  return {
    id: seg.id,
    trackPath: svgArcPath(cx, cy, bandRadius, startDeg, endDeg, sweepFlag),
    fillPath:
      activeSpan >= 1.5
        ? svgArcPath(cx, cy, bandRadius, startDeg, startDeg + dir * activeSpan, sweepFlag)
        : null,
    tone: seg.tone,
    parallel,
  };
};

/**
 * Generates SVG arc paths with a guaranteed gap at bottom center (`90°`) so the bottom
 * percentage badge stays clear. Supports explicit sector placements (Antigravity parallel 5H/WK
 * concentric arcs and top Argon arc) as well as symmetric bottom-to-top 2-arc 5H/WK rings.
 */
export function buildCircleSvgArcs(
  segments: readonly CircleArcSegment[],
  cx: number,
  cy: number,
  radius: number,
): CircleSvgArc[] {
  const count = Math.max(1, segments.length);
  const gapDeg = count === 1 ? 26 : count === 2 ? 18 : 14;
  const stepDeg = 360 / count;
  const arcDeg = stepDeg - gapDeg;
  const firstStartDeg = 90 + gapDeg / 2 + (count === 3 ? stepDeg : 0);

  return segments.map((seg, index) => {
    if (seg.placement) {
      return placedArcPath(seg, seg.placement, cx, cy, radius);
    }
    if (count === 2) {
      const isRightHalf = index === 1;
      const startDeg = isRightHalf ? 90 - gapDeg / 2 : 90 + gapDeg / 2;
      const sweepFlag: 0 | 1 = isRightHalf ? 0 : 1;
      const dir = sweepFlag === 1 ? 1 : -1;
      const endDeg = startDeg + dir * arcDeg;
      const activeSpan = arcDeg * seg.fillRatio;
      return {
        id: seg.id,
        trackPath: svgArcPath(cx, cy, radius, startDeg, endDeg, sweepFlag),
        fillPath:
          activeSpan >= 1.5
            ? svgArcPath(cx, cy, radius, startDeg, startDeg + dir * activeSpan, sweepFlag)
            : null,
        tone: seg.tone,
      };
    }

    const rawStart = firstStartDeg + index * stepDeg;
    const startDeg = ((rawStart % 360) + 360) % 360;
    const endDeg = startDeg + arcDeg;
    const activeSpan = arcDeg * seg.fillRatio;
    return {
      id: seg.id,
      trackPath: svgArcPath(cx, cy, radius, startDeg, endDeg, 1),
      fillPath:
        activeSpan >= 1.5 ? svgArcPath(cx, cy, radius, startDeg, startDeg + activeSpan, 1) : null,
      tone: seg.tone,
    };
  });
}
