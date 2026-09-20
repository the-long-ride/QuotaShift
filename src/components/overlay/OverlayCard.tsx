import React from "react";
import { ClaudeLogo } from "../claude/ClaudeLogo";
import { OverlayAccountData } from "./OverlayApp";
import { classifyAntigravityTier } from "../../utils/antigravity/antigravity-tier-summary";
import { classifyClaudeTier } from "../../utils/claude/claude-tier-summary";
import { classifyCodexTier } from "../../utils/codex/codex-tier-summary";

export function barColor(pct: number | null): string {
  if (pct === null) return "rgba(255,255,255,0.25)";
  if (pct < 10) return "#ef4444";
  if (pct < 20) return "#f97316";
  return "rgba(255,255,255,0.85)";
}

export function resolveTierBadgeText(
  provider: OverlayAccountData["provider"],
  tier: string | null | undefined,
): string {
  if (provider === "codex") return classifyCodexTier(tier, true);
  if (provider === "claude") {
    const normalized = classifyClaudeTier(tier);
    return normalized === "OTHER" && !tier ? "PRO" : normalized;
  }
  return classifyAntigravityTier(tier);
}

export const AntigravityLogo: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <img
    src="https://antigravity.google/assets/image/brand/antigravity-icon__white.png"
    width={size}
    height={size}
    alt="Antigravity"
    draggable={false}
    style={
      {
        display: "block",
        objectFit: "contain",
        userSelect: "none",
        pointerEvents: "none",
        WebkitUserDrag: "none",
      } as React.CSSProperties
    }
  />
);

export const OpenAILogo: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    fillRule="evenodd"
    clipRule="evenodd"
    strokeLinejoin="round"
    strokeMiterlimit={2}
    fill="white"
  >
    <path d="M474.123 209.81c11.525-34.577 7.569-72.423-10.838-103.904-27.696-48.168-83.433-72.94-137.794-61.414a127.14 127.14 0 00-95.475-42.49c-55.564 0-104.936 35.781-122.139 88.593-35.781 7.397-66.574 29.76-84.637 61.414-27.868 48.167-21.503 108.72 15.826 150.007-11.525 34.578-7.569 72.424 10.838 103.733 27.696 48.34 83.433 73.111 137.966 61.585 24.084 27.18 58.833 42.835 95.303 42.663 55.564 0 104.936-35.782 122.139-88.594 35.782-7.397 66.574-29.76 84.465-61.413 28.04-48.168 21.676-108.722-15.654-150.008v-.172zm-39.567-87.218c11.01 19.267 15.139 41.803 11.354 63.65-.688-.516-2.064-1.204-2.924-1.72l-101.152-58.49a16.965 16.965 0 00-16.687 0L206.621 194.5v-50.232l97.883-56.597c45.587-26.32 103.732-10.666 130.052 34.921zm-227.935 104.42l49.888-28.9 49.887 28.9v57.63l-49.887 28.9-49.888-28.9v-57.63zm23.223-191.81c22.364 0 43.867 7.742 61.07 22.02-.688.344-2.064 1.204-3.097 1.72L186.666 117.26c-5.161 2.925-8.258 8.43-8.258 14.45v136.934l-43.523-25.116V130.333c0-52.64 42.491-95.13 95.131-95.302l-.172.172zM52.14 168.697c11.182-19.268 28.557-34.062 49.544-41.803V247.14c0 6.02 3.097 11.354 8.258 14.45l118.354 68.295-43.695 25.288-97.711-56.425c-45.415-26.32-61.07-84.465-34.75-130.052zm26.665 220.71c-11.182-19.095-15.139-41.802-11.354-63.65.688.516 2.064 1.204 2.924 1.72l101.152 58.49a16.965 16.965 0 0016.687 0l118.354-68.467v50.232l-97.883 56.425c-45.587 26.148-103.732 10.665-130.052-34.75h.172zm204.54 87.39c-22.192 0-43.867-7.741-60.898-22.02a62.439 62.439 0 003.097-1.72l101.152-58.317c5.16-2.924 8.429-8.43 8.257-14.45V243.527l43.523 25.116v113.022c0 52.64-42.663 95.303-95.131 95.303v-.172zM461.22 343.303c-11.182 19.267-28.729 34.061-49.544 41.63V264.687c0-6.021-3.097-11.526-8.257-14.45L284.893 181.77l43.523-25.116 97.883 56.424c45.587 26.32 61.07 84.466 34.75 130.053l.172.172z" />
  </svg>
);

export const GeminiLogo: React.FC<{ size?: number }> = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
    <path
      d="M14 28C14 26.0633 13.6267 24.2433 12.88 22.54C12.1567 20.8367 11.165 19.355 9.905 18.095C8.645 16.835 7.16333 15.8433 5.46 15.12C3.75667 14.3733 1.93667 14 0 14C1.93667 14 3.75667 13.6383 5.46 12.915C7.16333 12.1683 8.645 11.165 9.905 9.905C11.165 8.645 12.1567 7.16333 12.88 5.46C13.6267 3.75667 14 1.93667 14 0C14 1.93667 14.3617 3.75667 15.085 5.46C15.8317 7.16333 16.835 8.645 18.095 9.905C19.355 11.165 20.8367 12.1683 22.54 12.915C24.2433 13.6383 26.0633 14 28 14C26.0633 14 24.2433 14.3733 22.54 15.12C20.8367 15.8433 19.355 16.835 18.095 18.095C16.835 19.355 15.8317 20.8367 15.085 22.54C14.3617 24.2433 14 26.0633 14 28Z"
      fill="white"
    />
  </svg>
);

export const BarRow: React.FC<{ rowLabel: string; pct: number | null; loading: boolean }> = ({
  rowLabel,
  pct,
  loading,
}) => {
  const l = rowLabel.toLowerCase(),
    label = l.includes("month")
      ? "MO"
      : l.includes("5h")
        ? "5H"
        : l.includes("week") || l === "wk"
          ? "WK"
          : rowLabel;
  const scale = Math.max(0, Math.min(100, pct ?? 0)) / 100;
  const tone =
    pct !== null && pct < 10 ? "critical" : pct !== null && pct < 20 ? "warning" : "normal";
  return (
    <div className="overlay-metric-row" data-usage-tone={tone}>
      <span className="overlay-metric-label">{label}</span>
      <div className="overlay-progress-track">
        <div
          className="overlay-progress-bar"
          style={{ transform: `scaleX(${scale})`, background: barColor(pct) }}
        />
      </div>
      <span className="overlay-metric-pct" style={{ color: barColor(pct) }}>
        {loading && pct === null ? "…" : pct !== null ? `${pct}%` : "—"}
      </span>
    </div>
  );
};

export const FamilyCol: React.FC<{
  label: string;
  fivePct: number | null;
  weeklyPct: number | null;
  loading: boolean;
}> = ({ label, fivePct, weeklyPct, loading }) => (
  <div className="overlay-family-col">
    <div className="overlay-family-logo">
      {label.toLowerCase().includes("gemini") ? (
        <GeminiLogo size={13} />
      ) : (
        <div className="overlay-dual-logo">
          <ClaudeLogo size={12} className="overlay-claude-logo" />
          <span className="overlay-logo-sep">
            <svg
              width={8}
              height={8}
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M2 9.75C2 9.33579 2.33579 9 2.75 9H17.25C17.6642 9 18 9.33579 18 9.75C18 10.1642 17.6642 10.5 17.25 10.5H2.75C2.33579 10.5 2 10.1642 2 9.75Z"
                fill="white"
              />
            </svg>
          </span>
          <OpenAILogo size={12} />
        </div>
      )}
    </div>
    <BarRow rowLabel="5H" pct={fivePct} loading={loading} />
    <BarRow rowLabel="WK" pct={weeklyPct} loading={loading} />
  </div>
);

export interface OverlayCardProps {
  data: OverlayAccountData;
  avatarError: boolean;
  setAvatarError: (v: boolean) => void;
  showTooltip: boolean;
  tooltipText: string | null;
}

export const OverlayCard: React.FC<OverlayCardProps> = ({
  data,
  avatarError,
  setAvatarError,
  showTooltip,
  tooltipText,
}) => {
  const loading = data.loading ?? false,
    rows = data.quotaRows ?? [],
    hasRows = rows.length > 0;
  const clamp = (v: number | null | undefined) =>
    v !== null && v !== undefined ? Math.max(0, Math.min(100, Math.round(v))) : null;
  const fivePct = clamp(data.fiveHourPercent),
    weeklyPct = clamp(data.weeklyPercent),
    initialLetter = (data.label?.trim() || data.email?.trim() || "Q")[0].toUpperCase(),
    isOpenAI = data.provider === "codex",
    tierText = resolveTierBadgeText(data.provider, data.tier);
  const cardClass = `glass-card glass-card--${data.provider}${hasRows ? " glass-card--wide" : ""}`;

  return (
    <div className={cardClass} data-provider={data.provider}>
      <div className="overlay-avatar-wrap">
        <span className="overlay-tier-badge">{tierText}</span>
        {data.provider === "claude" && data.claudeGuardrails?.fiveHourEnabled && (
          <span className="overlay-guardrail-badge overlay-guardrail-badge--five-hour">{`${data.claudeGuardrails.fiveHourThresholdPct}%`}</span>
        )}
        {data.provider === "claude" && data.claudeGuardrails?.weeklyEnabled && (
          <span className="overlay-guardrail-badge overlay-guardrail-badge--weekly">{`${data.claudeGuardrails.weeklyThresholdPct}%`}</span>
        )}
        {typeof data.resetCount === "number" && data.resetCount > 0 && (
          <span className="overlay-reset-badge">{data.resetCount}</span>
        )}
        {data.provider === "claude" ? (
          <div className="overlay-avatar-fallback overlay-avatar-fallback--claude">
            <ClaudeLogo size={22} className="overlay-claude-logo" />
          </div>
        ) : data.avatarUrl && !avatarError ? (
          <img
            className="overlay-avatar-img"
            src={data.avatarUrl}
            alt={data.label || "avatar"}
            draggable={false}
            onError={() => setAvatarError(true)}
          />
        ) : (
          <div className="overlay-avatar-fallback">{initialLetter}</div>
        )}
        {data.provider !== "claude" && (
          <span
            className="overlay-provider-badge"
            style={{ pointerEvents: "auto", cursor: "default" }}
          >
            {isOpenAI ? <OpenAILogo size={10} /> : <AntigravityLogo size={10} />}
          </span>
        )}
      </div>

      <div className="overlay-metrics">
        {hasRows ? (
          <div className="overlay-families-row">
            {rows.map((row, i) => (
              <FamilyCol
                key={i}
                label={row.label}
                fivePct={clamp(row.fiveHourPercent)}
                weeklyPct={clamp(row.weeklyPercent)}
                loading={loading}
              />
            ))}
          </div>
        ) : (
          <div className="overlay-single-family">
            <div className="overlay-parallel-bars">
              {data.singleBars && data.singleBars.length > 0 ? (
                data.singleBars.map((bar, i) => (
                  <BarRow key={i} rowLabel={bar.label} pct={clamp(bar.percent)} loading={loading} />
                ))
              ) : (
                <>
                  <BarRow rowLabel="5H" pct={fivePct} loading={loading} />
                  {weeklyPct !== null && <BarRow rowLabel="WK" pct={weeklyPct} loading={loading} />}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showTooltip && tooltipText && (
        <div className="overlay-tooltip" data-fallback="true" role="tooltip">
          <span className="overlay-tooltip-text">{tooltipText}</span>
        </div>
      )}
    </div>
  );
};
