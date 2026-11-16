import { useQuotaPercentMode } from "../../hooks/desktop/useQuotaPercentMode";
import { quotaPercentDisplay } from "../../utils/common/settings/quota-percent-mode";
import React, { useState } from "react";
import { ClaudeLogo } from "../claude/ClaudeLogo";
import { ClaudeStackedAvatar } from "../claude/ClaudeStackedAvatar";
import {
  AntigravityLogo,
  OpenAILogo,
  barColor,
  resolveTierBadgeText,
} from "../overlay/OverlayCard";
import {
  formatTaskbarPercent,
  type TaskbarColumn as Column,
} from "../../utils/common/ui/taskbar-columns";
import { TaskbarLineIconView } from "./TaskbarTooltipCard";
import { showsClaudeMark } from "../../utils/common/accounts/account-initial";

interface TaskbarColumnProps {
  column: Column;
  vertical?: boolean;
  onHover: (column: Column, element: HTMLElement) => void;
  onLeave: () => void;
  onOpen: (column: Column) => void;
  onMenu?: (column: Column, element: HTMLElement) => void;
}

/** Only low remaining values are tinted; normal ones follow the taskbar text color. */
const valueStyle = (percent: number | null): React.CSSProperties | undefined =>
  percent !== null && percent < 20 ? { color: barColor(percent) } : undefined;

/** Display mode affects percentages, but warning colors reflect remaining quota. */
const TaskbarQuotaValue: React.FC<{
  percent: number | null;
  className?: string;
  showPercentSuffix?: boolean;
}> = ({ percent, className, showPercentSuffix = true }) => {
  const showUsed = useQuotaPercentMode();
  const text = formatTaskbarPercent(quotaPercentDisplay(percent, showUsed));
  return (
    <span className={className} style={valueStyle(percent)}>
      {showPercentSuffix || text === "–" ? text : text.replace(/%$/, "")}
    </span>
  );
};

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
      ) : isClaude ? (
        <span className="taskbar-avatar-fallback taskbar-avatar-fallback--claude taskbar-avatar-initial--claude">
          <ClaudeStackedAvatar
            initial={column.initial}
            logoSize={17}
            bgClassName="taskbar-claude-bg-logo"
            letterClassName="taskbar-claude-avatar-letter"
          />
        </span>
      ) : (
        <span className="taskbar-avatar-fallback">{column.initial}</span>
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
  vertical = false,
  onHover,
  onLeave,
  onOpen,
  onMenu,
}) => {
  const hideAntigravityPoolChrome = vertical && column.provider === "antigravity";
  return (
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
        {column.lines.map((line) => {
          const showIcon = Boolean(line.icon) && !hideAntigravityPoolChrome;
          const showLabel = !line.icon;
          const hasPrefix = showIcon || showLabel;
          return (
            <span
              key={line.key}
              className={`taskbar-value${hasPrefix ? "" : " taskbar-value--no-prefix"}`}
            >
              {showIcon && line.icon ? (
                <TaskbarLineIconView icon={line.icon} size={vertical ? 7 : 9} />
              ) : (
                showLabel && <span className="taskbar-value-label">{line.label}</span>
              )}
              <span className="taskbar-value-pct">
                {line.values.map((value, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <span className="taskbar-value-sep">/</span>}
                    <TaskbarQuotaValue
                      percent={value}
                      showPercentSuffix={!(vertical && line.values.length > 1)}
                    />
                  </React.Fragment>
                ))}
              </span>
            </span>
          );
        })}
      </span>
      {column.argonWeeklyPercent !== undefined && (
        <>
          <span className="taskbar-argon-divider" aria-hidden="true" />
          <span className="taskbar-argon-col">
            {!hideAntigravityPoolChrome && (
              <span className="taskbar-argon-logo">
                <TaskbarLineIconView icon="gemini-4" size={vertical ? 8 : 9} />
              </span>
            )}
            <TaskbarQuotaValue
              className="taskbar-argon-pct"
              percent={column.argonWeeklyPercent}
              showPercentSuffix={!hideAntigravityPoolChrome}
            />
          </span>
        </>
      )}
    </button>
  );
};
