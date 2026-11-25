import React, { useEffect, useRef, useState } from "react";
import {
  OverlayCardStack,
  dashboardTabForTarget,
} from "../../../src/components/overlay/OverlayCardStack";
import { OverlayCircleStack } from "../../../src/components/overlay/OverlayCircleStack";
import { TaskbarTooltipCard } from "../../../src/components/taskbar/TaskbarTooltipCard";
import type { CircleOrientation } from "../../../src/utils/common/overlay/circle-layout";
import { resolveTargetAccountFromClick } from "../../../src/utils/common/overlay/overlay-card-target";
import type { PlatformId } from "../../../src/utils/common/ui/platform-visibility";
import type { OverlayTheme } from "../../../src/utils/common/ui/ui-adjustment";
import type { DemoCoordinator } from "../../hooks/useDemoCoordinator";
import { useStageOverlayDrag } from "../../hooks/useStageOverlayDrag";
import { useStageOverlayTooltip } from "../../hooks/useStageOverlayTooltip";
import { DemoSegmentedGroup } from "./DemoSection";
import {
  HudDemoContextMenu,
  computeStageMenuState,
  type StageMenuState,
} from "./HudDemoContextMenu";

export interface OverlayDemoSurfaceProps {
  coord: DemoCoordinator;
}

const STYLE_OPTS: Array<["cards" | "circle", string]> = [
  ["cards", "Card Stack"],
  ["circle", "Circle Nodes"],
];
const ORIENT_OPTS: Array<[CircleOrientation, string]> = [
  ["vertical", "Vertical"],
  ["horizontal", "Horizontal"],
];
const THEME_OPTS: Array<[OverlayTheme, string]> = [
  ["glassmorphism", "Glass"],
  ["mono", "Mono"],
];

export const OverlayDemoSurface: React.FC<OverlayDemoSurfaceProps> = ({ coord }) => {
  const [hudStyle, setHudStyle] = useState<"cards" | "circle">("cards");
  const [orientation, setOrientation] = useState<CircleOrientation>("vertical");
  const [hudTheme, setHudTheme] = useState<OverlayTheme>("glassmorphism");
  const [avatarError, setAvatarError] = useState(false);
  const [menuState, setMenuState] = useState<StageMenuState | null>(null);
  const [isHudHidden, setIsHudHidden] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const tooltipCardRef = useRef<HTMLDivElement>(null);
  const hasCards = coord.overlayCards.length > 0;
  const isCircle = hudStyle === "circle";
  const { offset, isDragging, hasMoved, resetPosition, dragHandlers } = useStageOverlayDrag(
    stageRef,
    hudRef,
    [hudStyle, orientation, hudTheme, coord.overlayCards.length, isHudHidden],
  );
  const tooltip = useStageOverlayTooltip({
    stageRef,
    cardRef: tooltipCardRef,
    orientation,
    suppressed: isDragging || Boolean(menuState) || isHudHidden,
    repositionDeps: [offset.x, offset.y, hudStyle, orientation, hudTheme, coord.isDarkMode],
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-overlay-theme", hudTheme);
    setIsHudHidden(false);
  }, [hudStyle, orientation, hudTheme]);

  useEffect(() => {
    if (!isDragging && coord.toast?.message !== "Demo data reset to defaults") return;
    if (!isDragging) setIsHudHidden(false);
    setMenuState(null);
  }, [isDragging, coord.toast?.id, coord.toast?.message]);

  const openMenu = (el: Element | null, x: number, y: number, target: StageMenuState["target"]) => {
    tooltip.clearImmediate();
    setMenuState(computeStageMenuState(stageRef.current, el, x, y, target));
  };

  const openDashboardFor = (provider: PlatformId) => {
    coord.setActiveTab(provider);
    coord.setActiveSurface("dashboard");
  };

  const handleCardMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isCircle || !hasCards) return;
    e.preventDefault();
    e.stopPropagation();
    const hit = resolveTargetAccountFromClick(e.target, e.clientY, coord.overlayCards);
    const slot = (e.target as HTMLElement | null)?.closest?.(".overlay-card-slot");
    openMenu(slot ?? hudRef.current, e.clientX, e.clientY, {
      provider: hit.provider,
      accountId: hit.accountId ?? null,
    });
  };

  const handleToolbarMenu = () => {
    if (menuState) return setMenuState(null);
    const first = coord.overlayCards[0];
    if (first && !isHudHidden) {
      openMenu(hudRef.current ?? stageRef.current, 0, 0, {
        provider: first.provider,
        accountId: first.accountId ?? null,
      });
    }
  };

  const onStyle = (next: "cards" | "circle") => {
    tooltip.clearImmediate();
    setHudStyle(next);
    setMenuState(null);
  };
  const swapOrient = () => setOrientation((p) => (p === "vertical" ? "horizontal" : "vertical"));
  const stackProps = { cards: coord.overlayCards, orientation, avatarError, setAvatarError };

  return (
    <div className="qs-overlay-demo">
      <div className="qs-demo-toolbar" role="toolbar" aria-label="Overlay HUD controls">
        <DemoSegmentedGroup
          label="Style"
          options={STYLE_OPTS}
          active={hudStyle}
          onSelect={onStyle}
        />
        <DemoSegmentedGroup
          label="Orientation"
          options={ORIENT_OPTS}
          active={orientation}
          onSelect={setOrientation}
        />
        <DemoSegmentedGroup
          label="HUD Theme"
          options={THEME_OPTS}
          active={hudTheme}
          onSelect={setHudTheme}
        />
        <div className="qs-demo-toolbar-actions">
          <button
            type="button"
            className={`qs-demo-reset-pos-btn qs-demo-menu-trigger${menuState ? " qs-demo-seg-btn--active" : ""}`}
            disabled={!hasCards || isHudHidden}
            onClick={handleToolbarMenu}
          >
            Context Menu
          </button>
          {hasMoved && (
            <button type="button" className="qs-demo-reset-pos-btn" onClick={resetPosition}>
              Reset Position
            </button>
          )}
        </div>
      </div>

      <div ref={stageRef} className="qs-overlay-stage" data-overlay-theme={hudTheme}>
        <div className="qs-overlay-backdrop" aria-hidden="true">
          <div className="qs-ide-topbar">
            <span className="qs-ide-tab qs-ide-tab--active">router.ts</span>
          </div>
          <div className="qs-ide-code">
            <div className="qs-ide-line">
              <span className="qs-ide-text">return routeCompletion(selectBestAccount().id);</span>
            </div>
          </div>
        </div>

        {isHudHidden || !hasCards ? (
          <div className="qs-demo-empty-stage">
            <p>{isHudHidden ? "Overlay HUD hidden" : "No accounts tracked in the HUD."}</p>
            <button
              type="button"
              className="qs-btn qs-btn--primary"
              onClick={isHudHidden ? () => setIsHudHidden(false) : coord.onResetDemo}
            >
              {isHudHidden ? "Show Overlay HUD" : "Reset Demo Accounts"}
            </button>
          </div>
        ) : (
          <div
            ref={hudRef}
            className={`qs-overlay-hud-float qs-overlay-hud-float--draggable${isDragging ? " qs-overlay-hud-float--dragging" : ""}`}
            style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
            data-dragging={isDragging ? "true" : undefined}
            onDoubleClick={(e) => {
              if (isDragging) return;
              const tab = dashboardTabForTarget(e.target);
              if (tab === "antigravity" || tab === "codex" || tab === "claude") {
                openDashboardFor(tab);
              }
            }}
            {...dragHandlers}
          >
            <div
              className={`overlay-container${isCircle ? " overlay-container--circle" : ""}`}
              data-overlay-theme={hudTheme}
              data-stack-orientation={orientation}
              data-circle-orientation={isCircle ? orientation : undefined}
              onContextMenu={handleCardMenu}
            >
              {isCircle ? (
                <OverlayCircleStack
                  {...stackProps}
                  onHoverNode={tooltip.onHover}
                  onLeaveNode={tooltip.onLeave}
                  onContextMenuNode={(data, el, ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    openMenu(el, ev.clientX, ev.clientY, {
                      provider: data.provider,
                      accountId: data.accountId ?? null,
                    });
                  }}
                />
              ) : (
                <OverlayCardStack
                  {...stackProps}
                  onHoverCard={tooltip.onHover}
                  onLeaveCard={tooltip.onLeave}
                />
              )}
            </div>
          </div>
        )}

        {tooltip.tooltipDetails && !isHudHidden && !menuState && (
          <div
            className="qs-overlay-tooltip-anchor taskbar-tooltip-root"
            data-overlay-theme={hudTheme}
            data-theme={coord.isDarkMode ? "dark" : "light"}
            data-placement={tooltip.pos.placement}
            style={{
              left: `${tooltip.pos.x}px`,
              top: `${tooltip.pos.y}px`,
              visibility: tooltip.pos.ready ? "visible" : "hidden",
            }}
          >
            <TaskbarTooltipCard
              ref={tooltipCardRef}
              details={tooltip.tooltipDetails}
              leaving={tooltip.leaving}
            />
          </div>
        )}

        {menuState && !isHudHidden && (
          <div
            className="qs-overlay-menu-anchor"
            style={{ left: `${menuState.x}px`, top: `${menuState.y}px` }}
          >
            <HudDemoContextMenu
              isOpen={true}
              coord={coord}
              target={menuState.target}
              overlayTheme={hudTheme}
              placement={menuState.tooltipPlacement}
              tooltipPlacement={menuState.tooltipPlacement}
              circleOrientation={isCircle ? orientation : undefined}
              onSwapOrientation={isCircle ? swapOrient : undefined}
              onHide={() => setIsHudHidden(true)}
              onClose={() => setMenuState(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
};
