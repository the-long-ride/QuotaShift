import React from "react";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import type { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ClaudeLogo } from "../claude/ClaudeLogo";
import { GeminiLogo, OpenAILogo, barColor, resolveTierBadgeText } from "../overlay/OverlayCard";
import {
  formatTaskbarPercent,
  type TaskbarLineIcon,
  type TaskbarTooltipDetails,
} from "../../utils/common/taskbar-columns";

export const TaskbarLineIconView: React.FC<{ icon: TaskbarLineIcon; size?: number }> = ({
  icon,
  size = 9,
}) => {
  if (icon === "gemini") {
    return (
      <span className="taskbar-line-icon">
        <GeminiLogo size={size} />
      </span>
    );
  }
  if (icon === "claude-openai") {
    return (
      <span className="taskbar-line-icon">
        <ClaudeLogo size={size} className="taskbar-claude-logo" />
        <OpenAILogo size={size} />
      </span>
    );
  }
  return null;
};

const clampPct = (value: number | null) =>
  value === null ? null : Math.max(0, Math.min(100, Math.round(value)));

/** Hover card for a taskbar item: a smaller take on the expanded account card. */
export const TaskbarTooltipCard = React.forwardRef<
  HTMLDivElement,
  { details: TaskbarTooltipDetails }
>(({ details }, ref) => {
  const tier = resolveTierBadgeText(details.provider, details.tier);
  const resets = details.resetCount;
  return (
    <div
      ref={ref}
      className={`taskbar-tooltip taskbar-tooltip--${details.provider}`}
      role="tooltip"
    >
      <div className="taskbar-tooltip-title">{details.title}</div>
      {details.email && details.email !== details.title && (
        <div className="taskbar-tooltip-email">{details.email}</div>
      )}
      <div className="taskbar-tooltip-chips">
        <span className="taskbar-tooltip-chip">{details.platform}</span>
        {tier && <span className="taskbar-tooltip-chip">{tier}</span>}
        {resets ? (
          <span className="taskbar-tooltip-chip taskbar-tooltip-chip--reset">
            {resets} reset{resets === 1 ? "" : "s"}
          </span>
        ) : null}
        {details.loading && <span className="taskbar-tooltip-chip">Refreshing…</span>}
      </div>
      {details.sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="taskbar-tooltip-section">
          {section.title && (
            <div className="taskbar-tooltip-section-title">
              <TaskbarLineIconView icon={section.icon} size={10} />
              {section.title}
            </div>
          )}
          {section.meters.map((meter, meterIndex) => {
            const pct = clampPct(meter.percent);
            return (
              <div key={meterIndex} className="taskbar-tooltip-meter">
                <span className="taskbar-tooltip-meter-label">{meter.label}</span>
                <span className="taskbar-tooltip-track">
                  <span
                    className="taskbar-tooltip-fill"
                    style={{ width: `${pct ?? 0}%`, background: barColor(pct) }}
                  />
                </span>
                <span
                  className="taskbar-tooltip-pct"
                  style={pct !== null && pct < 20 ? { color: barColor(pct) } : undefined}
                >
                  {formatTaskbarPercent(meter.percent)}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      <div className="taskbar-tooltip-hint">Double-click to open the dashboard</div>
    </div>
  );
});
TaskbarTooltipCard.displayName = "TaskbarTooltipCard";

/** Sizes the tooltip window to the rendered card and centres it just above the taskbar item. */
export async function placeTaskbarTooltip(
  win: ReturnType<typeof getCurrentWebviewWindow>,
  card: HTMLElement,
  anchorX: number,
  anchorY: number,
): Promise<void> {
  const width = Math.ceil(card.offsetWidth);
  const height = Math.ceil(card.offsetHeight);
  const dpr = window.devicePixelRatio || 1;
  await win.setSize(new LogicalSize(width, height));
  await win.setPosition(
    new PhysicalPosition(
      Math.round(anchorX - (width * dpr) / 2),
      Math.round(anchorY - (height + 6) * dpr),
    ),
  );
  await win.show();
}
