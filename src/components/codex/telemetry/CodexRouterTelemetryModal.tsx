import React, { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  buildTelemetryPeriodSummary,
  formatCompactTokens,
  formatPercent,
  RouterTelemetryReport,
  TELEMETRY_RANGES,
  TelemetryRange,
} from "./codexTelemetryTypes";
import { CodexRouterTelemetryChart } from "./CodexRouterTelemetryChart";

interface CodexRouterTelemetryModalProps {
  open: boolean;
  onClose: () => void;
}

const EMPTY_REPORT: RouterTelemetryReport = {
  generatedAt: 0,
  totalRequests: 0,
  cacheHitRequests: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCachedTokens: 0,
  totalReasoningTokens: 0,
  hourlyBuckets: [],
  byModel: [],
};

export const CodexRouterTelemetryModal: React.FC<CodexRouterTelemetryModalProps> = ({
  open,
  onClose,
}) => {
  const [range, setRange] = useState<TelemetryRange>("24h");
  const [report, setReport] = useState<RouterTelemetryReport>(EMPTY_REPORT);
  const [loading, setLoading] = useState(false);

  const loadTelemetry = useCallback(async () => {
    setLoading(true);
    try {
      const next = await invoke<RouterTelemetryReport>("get_codex_router_telemetry");
      if (next) setReport(next);
    } catch {
      // Fallback to empty report when backend is unavailable in browser previews
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadTelemetry();
    const timer = setInterval(() => void loadTelemetry(), 4000);
    return () => clearInterval(timer);
  }, [open, loadTelemetry]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const summary = useMemo(() => buildTelemetryPeriodSummary(report, range), [report, range]);

  if (!open) return null;

  const maxModelTokens = Math.max(1, ...summary.byModel.map((m) => m.inputTokens + m.outputTokens));

  return (
    <div
      className="dialog-overlay qs-telemetry-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Token usage telemetry"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="qs-telemetry-modal">
        <div className="qs-telemetry-header">
          <div className="qs-telemetry-header-title">
            <h3>Token Usage &amp; Cache Telemetry</h3>
            <span>Codex Router gateway metrics across active model pools</span>
          </div>
          <div className="qs-telemetry-header-actions">
            <div className="qs-telemetry-tabs" role="tablist" aria-label="Telemetry time range">
              {TELEMETRY_RANGES.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  data-tooltip={`Show ${opt.label} telemetry`}
                  aria-selected={range === opt.id}
                  className={`qs-telemetry-tab ${range === opt.id ? "qs-telemetry-tab--active" : ""}`}
                  onClick={() => setRange(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              data-tooltip="Refresh telemetry data"
              className="qs-router-server-btn"
              onClick={() => void loadTelemetry()}
              disabled={loading}
              aria-label="Refresh telemetry"
            >
              Refresh
            </button>
            <button
              type="button"
              data-tooltip="Close telemetry modal"
              className="qs-telemetry-close-btn"
              onClick={onClose}
              aria-label="Close telemetry modal"
            >
              ×
            </button>
          </div>
        </div>

        <div className="qs-telemetry-body">
          <div className="qs-telemetry-kpis">
            <div className="qs-telemetry-kpi">
              <span className="qs-telemetry-kpi-label">Total Tokens</span>
              <strong className="qs-telemetry-kpi-value">
                {formatCompactTokens(summary.totalTokens)}
              </strong>
              <span className="qs-telemetry-kpi-sub">
                {formatCompactTokens(summary.inputTokens)} in ·{" "}
                {formatCompactTokens(summary.outputTokens)} out
                {summary.reasoningTokens > 0
                  ? ` (${formatCompactTokens(summary.reasoningTokens)} reasoning)`
                  : ""}
              </span>
            </div>
            <div className="qs-telemetry-kpi">
              <span className="qs-telemetry-kpi-label">Cached Hit Tokens</span>
              <strong className="qs-telemetry-kpi-value qs-telemetry-kpi-value--accent">
                {formatCompactTokens(summary.cachedTokens)}
              </strong>
              <span className="qs-telemetry-kpi-sub">
                {formatPercent(summary.tokenCacheSharePercent)} of input tokens served from cache
              </span>
            </div>
            <div className="qs-telemetry-kpi">
              <span className="qs-telemetry-kpi-label">Cache Hit Rate</span>
              <strong className="qs-telemetry-kpi-value">
                {formatPercent(summary.cacheHitRatePercent)}
              </strong>
              <span className="qs-telemetry-kpi-sub">
                {summary.cacheHitRequests.toLocaleString()} / {summary.requests.toLocaleString()}{" "}
                requests hit cache
              </span>
            </div>
            <div className="qs-telemetry-kpi">
              <span className="qs-telemetry-kpi-label">Routed Requests</span>
              <strong className="qs-telemetry-kpi-value">
                {summary.requests.toLocaleString()}
              </strong>
              <span className="qs-telemetry-kpi-sub">
                Avg{" "}
                {summary.requests > 0
                  ? formatCompactTokens(Math.round(summary.totalTokens / summary.requests))
                  : "0"}{" "}
                tokens / req
              </span>
            </div>
          </div>

          <CodexRouterTelemetryChart points={summary.points} />

          <div className="qs-telemetry-models">
            <div className="qs-telemetry-models-head">
              <span className="qs-telemetry-section-title">Per-Model Usage Breakdown</span>
              <span className="qs-telemetry-section-sub">
                {summary.byModel.length} {summary.byModel.length === 1 ? "model" : "models"}
              </span>
            </div>
            {summary.byModel.length === 0 ? (
              <div className="qs-telemetry-empty">
                No token usage recorded in this time window yet.
              </div>
            ) : (
              <div className="qs-telemetry-model-list">
                {summary.byModel.map((m) => {
                  const total = m.inputTokens + m.outputTokens;
                  const widthPct = Math.max(3, Math.min(100, (total / maxModelTokens) * 100));
                  const cacheShare = m.inputTokens > 0 ? (m.cachedTokens / m.inputTokens) * 100 : 0;
                  const reqHitRate = m.requests > 0 ? (m.cacheHitRequests / m.requests) * 100 : 0;
                  return (
                    <div key={m.model} className="qs-telemetry-model-row">
                      <div className="qs-telemetry-model-top">
                        <span className="qs-telemetry-model-name">{m.model}</span>
                        <div className="qs-telemetry-model-metrics">
                          <span>
                            <strong>{formatCompactTokens(total)}</strong> total
                          </span>
                          <span>{formatCompactTokens(m.inputTokens)} in</span>
                          <span>{formatCompactTokens(m.outputTokens)} out</span>
                          <span className="qs-telemetry-model-cache">
                            {formatCompactTokens(m.cachedTokens)} cached (
                            {formatPercent(cacheShare)})
                          </span>
                          <span>
                            {m.requests.toLocaleString()} reqs ({formatPercent(reqHitRate)} hit)
                          </span>
                        </div>
                      </div>
                      <div className="qs-telemetry-model-bar-track">
                        <div
                          className="qs-telemetry-model-bar-fill"
                          style={{ width: `${widthPct.toFixed(1)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
