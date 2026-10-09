import React, { useState } from "react";
import { ClaudeLogo } from "../claude/ClaudeLogo";
import {
  AntigravityLogo,
  OpenAILogo,
  barColor,
  resolveTierBadgeText,
} from "../overlay/OverlayCard";
import {
  formatTaskbarPercent,
  type TaskbarColumn as Column,
} from "../../utils/common/taskbar-columns";
import { TaskbarLineIconView } from "./TaskbarTooltipCard";
import { showsClaudeMark } from "../../utils/common/account-initial";

interface TaskbarColumnProps {
  column: Column;
  onHover: (column: Column, element: HTMLElement) => void;
  onLeave: () => void;
  onOpen: (column: Column) => void;
  onMenu?: (column: Column, element: HTMLElement) => void;
}

/** Only low remaining values are tinted; normal ones follow the taskbar text color. */
const valueStyle = (percent: number | null): React.CSSProperties | undefined =>
  percent !== null && percent < 20 ? { color: barColor(percent) } : undefined;

/**
 * Real avatar (or the alias letter) with the overlay's compact badges laid out the same way:
 * plan tier bottom-left, reset count top-right, Claude guardrails on the right edge (5H top,
 * WK bottom) and the provider icon bottom-right for the other providers.
 */
const TaskbarAvatar: React.FC<{ column: Column }> = ({ column }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const tier = resolveTierBadgeText(column.provider, column.tier);
  const isClaude = column.provider === "claude";
  const claudeMark = showsClaudeMark(column.provider, column.accountId);
  const guardrails = isClaude ? column.details.guardrails : null;
  const showImage = !claudeMark && column.avatarUrl && failedUrl !== column.avatarUrl;
  return (
    <span className={`taskbar-avatar taskbar-avatar--${column.provider}`}>
      {claudeMark ? (
        <span className="taskbar-avatar-fallback taskbar-avatar-fallback--claude">
          <ClaudeLogo size={15} />
        </span>
      ) : showImage ? (
        <img
          className="taskbar-avatar-img"
          src={column.avatarUrl ?? undefined}
          alt=""
          draggable={false}
          onError={() => setFailedUrl(column.avatarUrl)}
        />
      ) : (
        <span
          className={`taskbar-avatar-fallback${isClaude ? " taskbar-avatar-fallback--claude" : ""}`}
        >
          {column.initial}
        </span>
      )}
      {tier && <span className="taskbar-tier-badge">{tier}</span>}
      {guardrails?.fiveHourEnabled && (
        <span className="taskbar-guardrail-badge taskbar-guardrail-badge--five-hour">
          {`${guardrails.fiveHourThresholdPct}%`}
        </span>
      )}
      {guardrails?.weeklyEnabled && (
        <span className="taskbar-guardrail-badge taskbar-guardrail-badge--weekly">
          {`${guardrails.weeklyThresholdPct}%`}
        </span>
      )}
      {column.resetCount && column.resetCount > 0 ? (
        <span className="taskbar-reset-badge">{column.resetCount}</span>
      ) : null}
      {!isClaude && (
        <span className="taskbar-provider-badge">
          {column.provider === "codex" ? <OpenAILogo size={8} /> : <AntigravityLogo size={8} />}
        </span>
      )}
    </span>
  );
};

/** One tracked account: avatar with compact badges plus text values (no bars). */
export const TaskbarColumn: React.FC<TaskbarColumnProps> = ({
  column,
  onHover,
  onLeave,
  onOpen,
  onMenu,
}) => (
  <button
    type="button"
    className={`taskbar-col taskbar-col--${column.provider}${column.loading ? " taskbar-col--loading" : ""}`}
    onMouseEnter={(event) => onHover(column, event.currentTarget)}
    onMouseLeave={onLeave}
    onClick={(event) => {
      event.stopPropagation();
      onMenu?.(column, event.currentTarget);
    }}
    onContextMenu={(event) => {
      event.preventDefault();
      event.stopPropagation();
      onMenu?.(column, event.currentTarget);
    }}
    onDoubleClick={() => onOpen(column)}
    aria-label={column.label}
    data-tooltip={column.label}
    data-slide-key={column.key}
  >
    <TaskbarAvatar column={column} />
    <span className="taskbar-values">
      {column.lines.map((line) => (
        <span key={line.key} className="taskbar-value">
          {line.icon ? (
            <TaskbarLineIconView icon={line.icon} />
          ) : (
            <span className="taskbar-value-label">{line.label}</span>
          )}
          <span className="taskbar-value-pct">
            {line.values.map((value, index) => (
              <React.Fragment key={index}>
                {index > 0 && <span className="taskbar-value-sep">/</span>}
                <span style={valueStyle(value)}>{formatTaskbarPercent(value)}</span>
              </React.Fragment>
            ))}
          </span>
        </span>
      ))}
    </span>
  </button>
);
