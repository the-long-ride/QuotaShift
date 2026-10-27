import React, { useState } from "react";
import { AggregatedPoint, formatCompactTokens, formatPercent } from "./codexTelemetryTypes";

interface CodexRouterTelemetryChartProps {
  points: AggregatedPoint[];
}

export const CodexRouterTelemetryChart: React.FC<CodexRouterTelemetryChartProps> = ({ points }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const safePoints = points.length > 0 ? points : [];
  const maxTokens = Math.max(1, ...safePoints.map((p) => p.inputTokens + p.outputTokens));

  const svgWidth = 600;
  const tokenChartHeight = 128;
  const hitChartHeight = 76;
  const padLeft = 40;
  const padRight = 14;
  const padTop = 10;
  const padBottom = 22;

  const plotW = svgWidth - padLeft - padRight;
  const tokenPlotH = tokenChartHeight - padTop - padBottom;
  const hitPlotH = hitChartHeight - padTop - padBottom;

  const count = Math.max(1, safePoints.length);
  const slotW = plotW / count;
  const barW = Math.max(4, Math.min(18, slotW * 0.62));

  const hitPolylinePoints = safePoints
    .map((pt, idx) => {
      const cx = padLeft + idx * slotW + slotW / 2;
      const cy = padTop + hitPlotH - (Math.min(100, pt.cacheHitRate) / 100) * hitPlotH;
      return `${cx.toFixed(1)},${cy.toFixed(1)}`;
    })
    .join(" ");

  const hitAreaPoints =
    safePoints.length > 0
      ? `${(padLeft + slotW / 2).toFixed(1)},${(padTop + hitPlotH).toFixed(1)} ${hitPolylinePoints} ${(
          padLeft +
          (safePoints.length - 1) * slotW +
          slotW / 2
        ).toFixed(1)},${(padTop + hitPlotH).toFixed(1)}`
      : "";

  const activePoint = hoverIdx !== null && safePoints[hoverIdx] ? safePoints[hoverIdx] : null;

  const labelIndices = new Set<number>();
  if (safePoints.length > 0) {
    labelIndices.add(0);
    labelIndices.add(Math.floor((safePoints.length - 1) / 2));
    labelIndices.add(safePoints.length - 1);
  }

  return (
    <div className="qs-telemetry-charts">
      <div className="qs-telemetry-chart-card">
        <div className="qs-telemetry-chart-head">
          <span className="qs-telemetry-chart-title">Token Usage Over Time</span>
          <div className="qs-telemetry-legend">
            <span className="qs-telemetry-legend-item">
              <i className="qs-telemetry-swatch qs-telemetry-swatch--cached" />
              Cached Input
            </span>
            <span className="qs-telemetry-legend-item">
              <i className="qs-telemetry-swatch qs-telemetry-swatch--input" />
              Uncached Input
            </span>
            <span className="qs-telemetry-legend-item">
              <i className="qs-telemetry-swatch qs-telemetry-swatch--output" />
              Output
            </span>
          </div>
        </div>
        <svg
          className="qs-telemetry-svg"
          viewBox={`0 0 ${svgWidth} ${tokenChartHeight}`}
          role="img"
          aria-label="Token usage chart"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {[0, 0.5, 1].map((ratio) => {
            const y = padTop + tokenPlotH * (1 - ratio);
            const label = formatCompactTokens(maxTokens * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  className="qs-telemetry-grid-line"
                />
                <text x={padLeft - 5} y={y + 3} className="qs-telemetry-axis-text">
                  {label}
                </text>
              </g>
            );
          })}
          {safePoints.map((pt, idx) => {
            const total = pt.inputTokens + pt.outputTokens;
            const cached = Math.min(pt.inputTokens, pt.cachedTokens);
            const uncached = Math.max(0, pt.inputTokens - cached);
            const output = pt.outputTokens;

            const cachedH = (cached / maxTokens) * tokenPlotH;
            const uncachedH = (uncached / maxTokens) * tokenPlotH;
            const outputH = (output / maxTokens) * tokenPlotH;

            const x = padLeft + idx * slotW + (slotW - barW) / 2;
            const yBase = padTop + tokenPlotH;
            const yCached = yBase - cachedH;
            const yUncached = yCached - uncachedH;
            const yOutput = yUncached - outputH;

            return (
              <g
                key={pt.startTs}
                onMouseEnter={() => setHoverIdx(idx)}
                className="qs-telemetry-bar-group"
              >
                <rect
                  x={padLeft + idx * slotW}
                  y={padTop}
                  width={slotW}
                  height={tokenPlotH}
                  fill="transparent"
                />
                {total > 0 && (
                  <>
                    <rect
                      x={x}
                      y={yCached}
                      width={barW}
                      height={Math.max(0, cachedH)}
                      className="qs-telemetry-bar--cached"
                      rx={1.5}
                    />
                    <rect
                      x={x}
                      y={yUncached}
                      width={barW}
                      height={Math.max(0, uncachedH)}
                      className="qs-telemetry-bar--input"
                    />
                    <rect
                      x={x}
                      y={yOutput}
                      width={barW}
                      height={Math.max(0, outputH)}
                      className="qs-telemetry-bar--output"
                      rx={1.5}
                    />
                  </>
                )}
                {labelIndices.has(idx) && (
                  <text
                    x={padLeft + idx * slotW + slotW / 2}
                    y={tokenChartHeight - 5}
                    textAnchor="middle"
                    className="qs-telemetry-x-text"
                  >
                    {pt.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="qs-telemetry-chart-card">
        <div className="qs-telemetry-chart-head">
          <span className="qs-telemetry-chart-title">Prompt Cache Hit Rate (%)</span>
          <span className="qs-telemetry-chart-sub">
            {activePoint
              ? `${activePoint.label} · ${formatPercent(activePoint.cacheHitRate)} hits (${formatCompactTokens(activePoint.cachedTokens)} cached / ${formatCompactTokens(activePoint.inputTokens)} in)`
              : "Hover bars or points to inspect bucket details"}
          </span>
        </div>
        <svg
          className="qs-telemetry-svg"
          viewBox={`0 0 ${svgWidth} ${hitChartHeight}`}
          role="img"
          aria-label="Cache hit rate chart"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {[0, 50, 100].map((pct) => {
            const y = padTop + hitPlotH * (1 - pct / 100);
            return (
              <g key={pct}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  className="qs-telemetry-grid-line"
                />
                <text x={padLeft - 5} y={y + 3} className="qs-telemetry-axis-text">
                  {pct}%
                </text>
              </g>
            );
          })}
          {hitAreaPoints && <polygon points={hitAreaPoints} className="qs-telemetry-hit-area" />}
          {hitPolylinePoints && (
            <polyline fill="none" points={hitPolylinePoints} className="qs-telemetry-hit-line" />
          )}
          {safePoints.map((pt, idx) => {
            const cx = padLeft + idx * slotW + slotW / 2;
            const cy = padTop + hitPlotH - (Math.min(100, pt.cacheHitRate) / 100) * hitPlotH;
            return (
              <g key={pt.startTs} onMouseEnter={() => setHoverIdx(idx)}>
                <rect
                  x={padLeft + idx * slotW}
                  y={padTop}
                  width={slotW}
                  height={hitPlotH}
                  fill="transparent"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={hoverIdx === idx ? 3.5 : 2}
                  className="qs-telemetry-hit-dot"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
