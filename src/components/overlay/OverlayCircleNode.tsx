import React from "react";
import { useQuotaPercentMode } from "../../hooks/desktop/useQuotaPercentMode";
import { accountInitial, showsClaudeMark } from "../../utils/common/accounts/account-initial";
import { buildCircleSvgArcs, buildCircleTelemetry } from "../../utils/common/overlay/circle-layout";
import { ClaudeLogo } from "../claude/ClaudeLogo";
import { ClaudeStackedAvatar } from "../claude/ClaudeStackedAvatar";
import { AntigravityLogo, OpenAILogo, resolveTierBadgeText } from "./OverlayCard";
import type { OverlayAccountData } from "./OverlayApp";

const RING_BOX_SIZE = 58;
const RING_CENTER = 29;
const RING_RADIUS = 25;

interface OverlayCircleNodeProps {
  data: OverlayAccountData;
  avatarError: boolean;
  setAvatarError: (value: boolean) => void;
  onHover: (data: OverlayAccountData, element: HTMLElement) => void;
  onLeave: () => void;
  onContextMenu?: (data: OverlayAccountData, element: HTMLElement, event: React.MouseEvent) => void;
}

/**
 * Compact circular floating node: 40px account avatar with inset inner corner badges
 * hugged closely by segmented radial quota arcs and a bottom theme-matched `%` badge.
 */
export const OverlayCircleNode: React.FC<OverlayCircleNodeProps> = ({
  data,
  avatarError,
  setAvatarError,
  onHover,
  onLeave,
  onContextMenu,
}) => {
  const showUsed = useQuotaPercentMode();
  const loading = data.loading ?? false;
  const isClaude = data.provider === "claude";
  const claudeMark = showsClaudeMark(data.provider, data.accountId);
  const initialLetter = accountInitial([data.label, data.email], "Q");
  const tierText = resolveTierBadgeText(data.provider, data.tier);
  const telemetry = buildCircleTelemetry(data, showUsed);
  const arcs = buildCircleSvgArcs(telemetry.segments, RING_CENTER, RING_CENTER, RING_RADIUS);
  const emptyBadgeText = loading && telemetry.badgeMetrics.length === 0 ? "…" : "—";

  return (
    <div
      className={`overlay-circle-node overlay-circle-node--${data.provider}`}
      data-provider={data.provider}
      data-usage-tone={telemetry.summaryTone}
      aria-label={data.label || data.provider}
      onMouseEnter={(event) => onHover(data, event.currentTarget)}
      onMouseMove={(event) => onHover(data, event.currentTarget)}
      onMouseLeave={onLeave}
      onContextMenu={(event) => onContextMenu?.(data, event.currentTarget, event)}
    >
      <svg
        className="overlay-circle-ring"
        width={RING_BOX_SIZE}
        height={RING_BOX_SIZE}
        viewBox={`0 0 ${RING_BOX_SIZE} ${RING_BOX_SIZE}`}
        aria-hidden="true"
      >
        {arcs.map((arc) => (
          <React.Fragment key={arc.id}>
            <path
              d={arc.trackPath}
              className={`overlay-circle-arc-track${arc.parallel ? " overlay-circle-arc-track--parallel" : ""}`}
            />
            {arc.fillPath && (
              <path
                d={arc.fillPath}
                className={`overlay-circle-arc-fill overlay-circle-arc-fill--${arc.tone}${arc.parallel ? " overlay-circle-arc-fill--parallel" : ""}`}
              />
            )}
          </React.Fragment>
        ))}
      </svg>
      <div className="overlay-circle-avatar-zone">
        <div className="overlay-circle-avatar">
          {claudeMark ? (
            <div className="overlay-avatar-fallback overlay-avatar-fallback--claude">
              <ClaudeLogo size={20} className="overlay-claude-logo" />
            </div>
          ) : data.avatarUrl && !avatarError ? (
            <img
              className="overlay-circle-avatar-img"
              src={data.avatarUrl}
              alt={data.label || "avatar"}
              draggable={false}
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div
              className={`overlay-avatar-fallback${isClaude ? " overlay-avatar-initial--claude" : ""}`}
            >
              {isClaude ? (
                <ClaudeStackedAvatar
                  initial={initialLetter}
                  logoSize={24}
                  bgClassName="overlay-claude-bg-logo"
                  letterClassName="overlay-claude-avatar-letter"
                />
              ) : (
                initialLetter
              )}
            </div>
          )}
        </div>
        {isClaude && data.claudeGuardrails?.fiveHourEnabled && (
          <span className="overlay-circle-badge overlay-circle-guardrail-badge overlay-circle-guardrail-badge--five-hour">
            {`${data.claudeGuardrails.fiveHourThresholdPct}%`}
          </span>
        )}
        {typeof data.resetCount === "number" && data.resetCount > 0 && (
          <span className="overlay-circle-badge overlay-circle-reset-badge">{data.resetCount}</span>
        )}
        {(tierText || (isClaude && data.claudeGuardrails?.weeklyEnabled) || !isClaude) && (
          <div className="overlay-circle-bottom-badges">
            {tierText && (
              <span className="overlay-circle-badge overlay-circle-tier-badge">{tierText}</span>
            )}
            {isClaude && data.claudeGuardrails?.weeklyEnabled && (
              <span className="overlay-circle-badge overlay-circle-guardrail-badge overlay-circle-guardrail-badge--weekly">
                {`${data.claudeGuardrails.weeklyThresholdPct}%`}
              </span>
            )}
            {!isClaude && (
              <span className="overlay-circle-badge overlay-circle-provider-badge">
                {data.provider === "codex" ? <OpenAILogo size={8} /> : <AntigravityLogo size={8} />}
              </span>
            )}
          </div>
        )}
      </div>
      <span className="overlay-circle-pct-badge">
        {telemetry.badgeMetrics.length > 0
          ? telemetry.badgeMetrics.map((metric, idx) => (
              <React.Fragment key={metric.id}>
                {idx > 0 && (
                  <span className="overlay-circle-pct-sep" aria-hidden="true">
                    /
                  </span>
                )}
                <span className={`overlay-circle-pct-val overlay-circle-pct-val--${metric.tone}`}>
                  {`${metric.displayPercent}%`}
                </span>
              </React.Fragment>
            ))
          : emptyBadgeText}
      </span>
    </div>
  );
};
