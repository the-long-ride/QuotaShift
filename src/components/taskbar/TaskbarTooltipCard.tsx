import React from "react";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import type { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ClaudeLogo } from "../claude/ClaudeLogo";
import { AntigravityLogo, OpenAILogo as SvgOpenAILogo } from "../common/ModelLogos";
import { GuardrailShieldIcon } from "../common/GuardrailShieldIcon";
import { getNativeScale } from "../../hooks/desktop/useNativeZoomCompensation";
import { anchorMonitor, clampToMonitor, moveOntoMonitor } from "./taskbar-monitor";
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
      <div className="taskbar-tooltip-header">
        <div className="taskbar-tooltip-identity">
          <div className="taskbar-tooltip-title">{details.title}</div>
          {details.email && details.email !== details.title && (
            <div className="taskbar-tooltip-email">{details.email}</div>
          )}
        </div>
        <div className="taskbar-tooltip-provider-logo" aria-hidden="true">
          {details.provider === "claude" ? (
            <ClaudeLogo size={28} />
          ) : details.provider === "codex" ? (
            <SvgOpenAILogo size={28} fill="currentColor" />
          ) : (
            <AntigravityLogo size={28} fill="currentColor" />
          )}
        </div>
      </div>
      <div className="taskbar-tooltip-chips">
        {tier && <span className="taskbar-tooltip-chip">{tier}</span>}
        {resets ? (
          <span className="taskbar-tooltip-chip taskbar-tooltip-chip--reset">
            {resets} reset{resets === 1 ? "" : "s"}
          </span>
        ) : null}
        {details.provider === "claude" && details.guardrails?.fiveHourEnabled && (
          <span className="taskbar-tooltip-chip taskbar-tooltip-chip--guardrail">
            <GuardrailShieldIcon size={10} />
            <span>5H {details.guardrails.fiveHourThresholdPct}%</span>
          </span>
        )}
        {details.provider === "claude" && details.guardrails?.weeklyEnabled && (
          <span className="taskbar-tooltip-chip taskbar-tooltip-chip--guardrail">
            <GuardrailShieldIcon size={10} />
            <span>WK {details.guardrails.weeklyThresholdPct}%</span>
          </span>
        )}
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
            const tone =
              pct !== null && pct < 10
                ? "critical"
                : pct !== null && pct < 20
                  ? "warning"
                  : "normal";
            return (
              <div key={meterIndex} className="taskbar-tooltip-meter" data-usage-tone={tone}>
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
  const uiScale =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--overlay-ui-scale") || "1",
    ) || 1;
  const measuredHeight = Math.max(card.offsetHeight, card.scrollHeight + 2);
  const width = Math.ceil(card.offsetWidth * uiScale);
  const height = Math.ceil(measuredHeight * uiScale);
  const monitor = await anchorMonitor(anchorX, anchorY);
  await moveOntoMonitor(win, monitor);
  const scale = monitor?.scaleFactor ?? getNativeScale();
  await win.setSize(new LogicalSize(width, height));
  const outerSize = await win.outerSize().catch(() => null);
  const outerWidth = outerSize ? outerSize.width : Math.round(width * scale);
  const outerHeight = outerSize ? outerSize.height : Math.round(height * scale);
  const posX = Math.round(anchorX - outerWidth / 2);
  const posY = Math.round(anchorY - outerHeight - 6 * scale);
  const clamped = clampToMonitor(monitor, posX, posY, outerWidth, outerHeight, scale);
  await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
  await win.show();
}

/** Sizes and positions the tooltip window to show the taskbar context menu on top of the taskbar. */
export async function placeTaskbarMenu(
  win: ReturnType<typeof getCurrentWebviewWindow>,
  menuEl: HTMLElement,
  anchorX: number,
  anchorY: number,
): Promise<void> {
  const uiScale =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--overlay-ui-scale") || "1",
    ) || 1;
  const tooltipHeadroom = 28;
  const padX = 72;
  const baseMenuWidth = 120;
  const baseMenuHeight = 28;
  const rawWidth = menuEl && menuEl.offsetWidth > 50 ? menuEl.offsetWidth : baseMenuWidth;
  const rawHeight = menuEl && menuEl.offsetHeight > 10 ? menuEl.offsetHeight : baseMenuHeight;
  const width = Math.ceil((rawWidth + padX * 2) * uiScale);
  const height = Math.ceil((rawHeight + tooltipHeadroom + 12) * uiScale);
  const monitor = await anchorMonitor(anchorX, anchorY);
  await moveOntoMonitor(win, monitor);
  const scale = monitor?.scaleFactor ?? getNativeScale();
  await win.setSize(new LogicalSize(width, height));
  const outerSize = await win.outerSize().catch(() => null);
  const outerWidth = outerSize ? outerSize.width : Math.round(width * scale);
  const outerHeight = outerSize ? outerSize.height : Math.round(height * scale);
  const posX = Math.round(anchorX - outerWidth / 2);
  const posY = Math.round(anchorY - outerHeight - 4 * scale);
  const clamped = clampToMonitor(monitor, posX, posY, outerWidth, outerHeight, scale);
  await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
  await win.setFocusable(true);
  await win.show();
  await win.setFocus();
}
