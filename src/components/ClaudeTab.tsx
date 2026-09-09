import React from "react";
import type {
  ClaudeMonitorStatus,
  ClaudeObservedUsageWindow,
  ClaudeRateLimitWindow,
} from "../utils/types";

interface ClaudeTabProps {
  status: ClaudeMonitorStatus;
  isTracked?: boolean;
  onTrackClaude?: () => void;
}

const clampPercent = (value: number | null | undefined): number => {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const formatPercent = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `${Math.round(value * 10) / 10}%`;
};

const formatTokens = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
};

const formatDuration = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return "--";
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatReset = (epochSeconds: number | null | undefined): string => {
  if (epochSeconds == null || !Number.isFinite(epochSeconds)) return "Reset unavailable";
  const ms = epochSeconds > 10_000_000_000 ? epochSeconds : epochSeconds * 1000;
  return `Resets ${new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
};

const formatCaptureTime = (epochMs: number): string => {
  if (!epochMs) return "Unknown";
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
};

const UsageLane: React.FC<{ label: string; window: ClaudeRateLimitWindow }> = ({ label, window }) => {
  const used = window.usedPercentage;
  return (
    <div className="claude-usage-card">
      <div className="claude-usage-header">
        <span className="claude-usage-label">{label}</span>
        <span className="claude-usage-value">
          {used == null ? "Unavailable" : `${formatPercent(used)} used`}
        </span>
      </div>
      {used != null && (
        <div className="claude-progress" aria-hidden="true">
          <div className="claude-progress-fill" style={{ width: `${clampPercent(used)}%` }} />
        </div>
      )}
      <div className="claude-usage-meta">
        <span>{used == null ? "Usage percentage unavailable" : `${formatPercent(100 - clampPercent(used))} left`}</span>
        <span>{formatReset(window.resetsAt)}</span>
      </div>
    </div>
  );
};

const LocalUsageCard: React.FC<{ label: string; usage: ClaudeObservedUsageWindow }> = ({ label, usage }) => (
  <div className="claude-local-usage-card">
    <div className="claude-local-usage-title">{label}</div>
    <strong>{formatTokens(usage.processedTokens)} processed tokens</strong>
    <div className="claude-local-usage-meta">
      <span>{formatTokens(usage.outputTokens)} output</span>
      <span>{usage.requestCount.toLocaleString()} requests</span>
    </div>
  </div>
);

const Stat: React.FC<{ label: string; value: string; visible?: boolean }> = ({ label, value, visible = true }) => {
  if (!visible) return null;
  return (
    <div className="claude-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
};

export const formatClaudeModelName = (name: string | null | undefined): string => {
  if (!name) return "Claude";
  if (name === "claude-sonnet-5") return "Claude Sonnet  5";
  return name.replace(/claude-sonnet-5/g, "Claude Sonnet  5");
};

export const ClaudeTab: React.FC<ClaudeTabProps> = ({ status, isTracked = false, onTrackClaude }) => {
  if (status.error) {
    return (
      <section className="claude-monitor">
        <div className="claude-monitor-card claude-monitor-state-card">
          <div className="claude-state-dot claude-state-dot--error" />
          <div>
            <div className="claude-state-title">Claude local monitor needs attention</div>
            <div className="claude-state-copy">{status.error}</div>
          </div>
        </div>
      </section>
    );
  }

  if (!status.session) {
    return (
      <section className="claude-monitor">
        <div className="claude-monitor-card claude-monitor-state-card">
          <div className={`claude-state-dot ${status.installed ? "claude-state-dot--ready" : ""}`} />
          <div className="claude-state-content">
            <div className="claude-state-title">
              {status.localUsage ? "No active Claude session detected" : "No local Claude Code activity found yet"}
            </div>
            <div className="claude-state-copy">
              {status.localUsage
                ? "Showing recent local token activity observed on this device. Detailed session and model statistics will appear here when an active Claude session runs."
                : (
                  <>
                    QuotaShift monitors local Claude Code and Claude Desktop Code activity stored on this device. Claude.ai web-only usage is not exposed through a documented local API.
                    {!status.installed && " The Claude status-line bridge is not confirmed, but local Desktop/Code activity will still appear when available."}
                  </>
                )}
            </div>
          </div>
          {onTrackClaude && (
            <div className="claude-state-actions">
              <button
                type="button"
                className={`claude-track-btn ${isTracked ? "claude-track-btn--active" : ""}`}
                onClick={onTrackClaude}
                title={isTracked ? "Claude is currently tracked on desktop overlay" : "Track Claude session on desktop overlay"}
              >
                <span className={`claude-track-dot ${isTracked ? "claude-track-dot--active" : ""}`} />
                Track Claude
              </button>
            </div>
          )}
        </div>
        {status.localUsage && (
          <div className="claude-local-usage-section">
            <div className="claude-section-heading">
              <span>Local activity</span>
              <span>Observed on this device</span>
            </div>
            <div className="claude-local-usage-grid">
              <LocalUsageCard label="Last 5 hours" usage={status.localUsage.fiveHour} />
              <LocalUsageCard label="Last 7 days" usage={status.localUsage.sevenDay} />
            </div>
          </div>
        )}
      </section>
    );
  }

  const session = status.session;
  const isLocalTranscript = status.source === "localTranscript";
  const rawModel = session.modelDisplayName || session.modelId || "Claude";
  const model = formatClaudeModelName(rawModel);
  const contextUsed = session.contextUsedPercentage;
  const contextRemaining = session.contextRemainingPercentage
    ?? (contextUsed == null ? null : 100 - clampPercent(contextUsed));
  const project = session.projectDir || session.currentDir || "Unknown project";
  const hasExactPlanUsage = Boolean(session.fiveHour || session.sevenDay);

  return (
    <section className="claude-monitor">
      <div className="claude-monitor-card claude-session-card">
        <div className="claude-session-heading">
          <div>
            <div className="claude-eyebrow">
              {isLocalTranscript ? "Current local Claude session" : "Current Claude Code session"}
            </div>
            <div className="claude-session-model">{model}</div>
          </div>
          <div className="claude-session-actions">
            {onTrackClaude && (
              <button
                type="button"
                className={`claude-track-btn ${isTracked ? "claude-track-btn--active" : ""}`}
                onClick={onTrackClaude}
                title={isTracked ? "Claude is currently tracked on desktop overlay" : "Track Claude session on desktop overlay"}
              >
                <span className={`claude-track-dot ${isTracked ? "claude-track-dot--active" : ""}`} />
                Track Claude
              </button>
            )}
            <div className="claude-capture-badge">
              <span className="claude-state-dot claude-state-dot--ready" />
              {isLocalTranscript ? "Local activity" : `Captured ${formatCaptureTime(session.capturedAtMs)}`}
            </div>
          </div>
        </div>
        <div className="claude-session-meta">
          <span title={project}>{project}</span>
          <span>{session.sessionName || `Session ${session.sessionId.slice(0, 12)}`}</span>
          {session.claudeCodeVersion && <span>Claude Code {session.claudeCodeVersion}</span>}
          {isLocalTranscript && <span>{formatCaptureTime(session.capturedAtMs)}</span>}
        </div>
      </div>

      {hasExactPlanUsage ? (
        <div className="claude-usage-grid">
          {session.fiveHour && <UsageLane label="5-hour subscription usage" window={session.fiveHour} />}
          {session.sevenDay && <UsageLane label="7-day subscription usage" window={session.sevenDay} />}
        </div>
      ) : (
        <div className="claude-monitor-card claude-plan-note">
          Exact Claude plan-limit percentages are only exposed locally by Claude Code statusLine. QuotaShift is showing observed local token activity instead.
        </div>
      )}

      {status.localUsage && (
        <div className="claude-local-usage-section">
          <div className="claude-section-heading">
            <span>Local activity</span>
            <span>Observed on this device</span>
          </div>
          <div className="claude-local-usage-grid">
            <LocalUsageCard label="Last 5 hours" usage={status.localUsage.fiveHour} />
            <LocalUsageCard label="Last 7 days" usage={status.localUsage.sevenDay} />
          </div>
        </div>
      )}

      <div className="claude-monitor-card claude-context-card">
        <div className="claude-section-heading">
          <span>Context</span>
          <span>
            {contextUsed == null
              ? "Current local token counts"
              : `${formatPercent(contextUsed)} used / ${formatPercent(contextRemaining)} left`}
          </span>
        </div>
        {contextUsed != null && (
          <div className="claude-progress claude-progress--context" aria-hidden="true">
            <div className="claude-progress-fill" style={{ width: `${clampPercent(contextUsed)}%` }} />
          </div>
        )}
        <div className="claude-context-tokens">
          <span>{formatTokens(session.totalInputTokens)} input</span>
          <span>{formatTokens(session.totalOutputTokens)} output</span>
          {session.contextWindowSize != null && <span>{formatTokens(session.contextWindowSize)} window</span>}
        </div>
      </div>

      <div className="claude-stat-grid">
        <Stat label="Session cost" value={session.totalCostUsd != null ? `$${session.totalCostUsd.toFixed(2)}` : "--"} visible={session.totalCostUsd != null} />
        <Stat label="Session duration" value={formatDuration(session.totalDurationMs)} visible={session.totalDurationMs != null} />
        <Stat label="API duration" value={formatDuration(session.totalApiDurationMs)} visible={session.totalApiDurationMs != null} />
        <Stat label="Current input" value={formatTokens(session.currentInputTokens)} visible={session.currentInputTokens != null} />
        <Stat label="Current output" value={formatTokens(session.currentOutputTokens)} visible={session.currentOutputTokens != null} />
        <Stat label="Cache read" value={formatTokens(session.cacheReadInputTokens)} visible={session.cacheReadInputTokens != null} />
        <Stat label="Cache write" value={formatTokens(session.cacheCreationInputTokens)} visible={session.cacheCreationInputTokens != null} />
      </div>
    </section>
  );
};
