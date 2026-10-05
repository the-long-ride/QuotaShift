import React, { useState } from "react";
import { barColor } from "../overlay/OverlayCard";
import {
  formatTaskbarPercent,
  type TaskbarColumn as Column,
} from "../../utils/common/taskbar-columns";

interface TaskbarColumnProps {
  column: Column;
  onHover: (column: Column, element: HTMLElement) => void;
  onLeave: () => void;
  onOpen: () => void;
}

/** One tracked account: avatar plus up to two compact quota bars, side by side with others. */
export const TaskbarColumn: React.FC<TaskbarColumnProps> = ({
  column,
  onHover,
  onLeave,
  onOpen,
}) => {
  const [avatarError, setAvatarError] = useState(false);
  return (
    <button
      type="button"
      className={`taskbar-col taskbar-col--${column.provider}${column.loading ? " taskbar-col--loading" : ""}`}
      onMouseEnter={(event) => onHover(column, event.currentTarget)}
      onMouseLeave={onLeave}
      onClick={onOpen}
      aria-label={column.label}
      data-tooltip={column.label}
    >
      <span className="taskbar-avatar">
        {column.avatarUrl && !avatarError ? (
          <img
            src={column.avatarUrl}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setAvatarError(true)}
          />
        ) : (
          <span className="taskbar-avatar-initial">{column.initial}</span>
        )}
        {column.resetCount ? <span className="taskbar-reset-dot">{column.resetCount}</span> : null}
      </span>
      <span className="taskbar-bars">
        {column.bars.map((bar) => (
          <span key={bar.label} className="taskbar-bar-row">
            <span className="taskbar-bar-label">{bar.label.slice(0, 3)}</span>
            <span className="taskbar-bar-track">
              <span
                className="taskbar-bar-fill"
                style={{
                  width: `${Math.max(0, Math.min(100, bar.percent ?? 0))}%`,
                  background: barColor(bar.percent),
                }}
              />
            </span>
            <span className="taskbar-bar-pct">{formatTaskbarPercent(bar.percent)}</span>
          </span>
        ))}
      </span>
    </button>
  );
};
