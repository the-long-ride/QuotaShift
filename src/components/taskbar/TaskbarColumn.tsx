import React from "react";
import { barColor } from "../overlay/OverlayCard";
import {
  formatTaskbarPercent,
  type TaskbarColumn as Column,
} from "../../utils/common/taskbar-columns";

interface TaskbarColumnProps {
  column: Column;
  onHover: (column: Column, element: HTMLElement) => void;
  onLeave: () => void;
  onOpen: (column: Column) => void;
}

/** Only low remaining values are tinted; normal ones follow the taskbar text color. */
const valueStyle = (percent: number | null): React.CSSProperties | undefined =>
  percent !== null && percent < 20 ? { color: barColor(percent) } : undefined;

/** One tracked account: provider badge plus compact text values (no bars). */
export const TaskbarColumn: React.FC<TaskbarColumnProps> = ({
  column,
  onHover,
  onLeave,
  onOpen,
}) => (
  <button
    type="button"
    className={`taskbar-col taskbar-col--${column.provider}${column.loading ? " taskbar-col--loading" : ""}`}
    onMouseEnter={(event) => onHover(column, event.currentTarget)}
    onMouseLeave={onLeave}
    onDoubleClick={() => onOpen(column)}
    aria-label={column.label}
    data-tooltip={column.label}
  >
    <span className={`taskbar-badge taskbar-badge--${column.provider}`}>
      {column.initial}
      {column.resetCount ? <span className="taskbar-reset-dot">{column.resetCount}</span> : null}
    </span>
    <span className="taskbar-values">
      {column.bars.map((bar) => (
        <span key={bar.label} className="taskbar-value">
          <span className="taskbar-value-label">{bar.label.slice(0, 3)}</span>
          <span className="taskbar-value-pct" style={valueStyle(bar.percent)}>
            {formatTaskbarPercent(bar.percent)}
          </span>
        </span>
      ))}
    </span>
  </button>
);
