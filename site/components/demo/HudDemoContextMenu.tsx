import React, { useEffect, useRef } from "react";
import { OverlayContextMenu } from "../../../src/components/overlay/tooltip/OverlayContextMenu";
import type { CircleOrientation } from "../../../src/utils/common/overlay/circle-layout";
import type { PlatformId } from "../../../src/utils/common/ui/platform-visibility";
import type { OverlayTheme } from "../../../src/utils/common/ui/ui-adjustment";
import type { DemoCoordinator } from "../../hooks/useDemoCoordinator";

export interface HudDemoMenuTarget {
  provider: PlatformId;
  accountId?: string | null;
}

export interface StageMenuPosition {
  x: number;
  y: number;
  tooltipPlacement: "above" | "below";
}

export interface StageMenuState extends StageMenuPosition {
  target: HudDemoMenuTarget;
}

export function computeStageMenuState(
  stage: Element | null,
  anchor: Element | null,
  clientX: number,
  clientY: number,
  target: HudDemoMenuTarget,
): StageMenuState | null {
  if (!stage) return null;
  const stageRect = stage.getBoundingClientRect();
  const rect = anchor?.getBoundingClientRect();
  const cx = clientX || (rect ? rect.left + rect.width / 2 : 0);
  const cy = clientY || (rect ? rect.top : 0);
  const pad = 12;
  const x = Math.max(
    pad,
    Math.min(cx - stageRect.left - 110, Math.max(pad, stageRect.width - 232)),
  );
  const y = Math.max(pad, Math.min(cy - stageRect.top - 48, Math.max(pad, stageRect.height - 52)));
  return { x, y, tooltipPlacement: y < 56 ? "below" : "above", target };
}

export interface HudDemoContextMenuProps {
  isOpen: boolean;
  coord: DemoCoordinator;
  target: HudDemoMenuTarget | null;
  overlayTheme: OverlayTheme;
  placement?: "above" | "below" | "left" | "right";
  tooltipPlacement?: "above" | "below";
  circleOrientation?: CircleOrientation;
  onSwapOrientation?: () => void;
  onHide: () => void;
  onClose: () => void;
}

export const HudDemoContextMenu: React.FC<HudDemoContextMenuProps> = ({
  isOpen,
  coord,
  target,
  overlayTheme,
  placement = "above",
  tooltipPlacement,
  circleOrientation,
  onSwapOrientation,
  onHide,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const targetEl = event.target as HTMLElement | null;
      if (targetEl?.closest?.(".overlay-context-menu, .qs-demo-menu-trigger, .taskbar-col")) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const provider: PlatformId = target?.provider ?? "antigravity";
  const accountId = target?.accountId ?? null;
  const appTheme: "light" | "dark" = coord.isDarkMode ? "dark" : "light";
  const resolvedTooltipPlacement = tooltipPlacement ?? (placement === "below" ? "below" : "above");

  const canApplyAccount =
    (provider === "antigravity" || provider === "codex") && Boolean(accountId);

  const handleApplyAccount = canApplyAccount
    ? (event: React.MouseEvent) => {
        event.stopPropagation();
        if (provider === "antigravity") {
          const account = coord.antigravityAccounts.find((item) => item.id === accountId);
          if (account) void coord.onApplyAntigravity(account);
        } else if (provider === "codex") {
          const account = coord.codexAccounts.find((item) => item.id === accountId);
          if (account) coord.onApplyCodex(account);
        }
        onClose();
      }
    : undefined;

  const handleRefreshUsage = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (provider === "antigravity" && accountId) {
      const account = coord.antigravityAccounts.find((item) => item.id === accountId);
      if (account) {
        coord.onRefreshAntigravityQuota(account);
      } else {
        coord.onRefreshAll();
      }
    } else if (provider === "codex" && accountId) {
      const account = coord.codexAccounts.find((item) => item.id === accountId);
      if (account) {
        coord.onRefreshCodex(account);
      } else {
        coord.onRefreshAll();
      }
    } else if (provider === "claude" && accountId) {
      coord.onRefreshClaudeAccount(accountId);
    } else {
      coord.onRefreshAll();
    }
    onClose();
  };

  const handleOpenDashboard = (event: React.MouseEvent) => {
    event.stopPropagation();
    coord.setActiveTab(provider);
    coord.setActiveSurface("dashboard");
    onClose();
  };

  const handleToggleTheme = (event: React.MouseEvent) => {
    event.stopPropagation();
    coord.onToggleTheme();
  };

  const handleSwapOrientation = onSwapOrientation
    ? (event: React.MouseEvent) => {
        event.stopPropagation();
        onSwapOrientation();
        onClose();
      }
    : undefined;

  const handleManageMonitored = (event: React.MouseEvent) => {
    event.stopPropagation();
    coord.setActiveTab(provider);
    coord.setActiveSurface("dashboard");
    coord.showToast("Pin or unpin up to 3 accounts using the heartbeat icon on any card", "info");
    onClose();
  };

  const handleHideOverlay = (event: React.MouseEvent) => {
    event.stopPropagation();
    onHide();
    onClose();
  };

  return (
    <div
      className="taskbar-menu-root qs-hud-menu-root"
      data-placement={placement}
      data-circle-menu={circleOrientation ? "true" : undefined}
      data-overlay-theme={overlayTheme}
      data-theme={appTheme}
    >
      <OverlayContextMenu
        isOpen={isOpen}
        x={0}
        y={0}
        appTheme={appTheme}
        menuRef={menuRef}
        onClose={onClose}
        onApplyAccount={handleApplyAccount}
        onRefreshUsage={handleRefreshUsage}
        onOpenDashboard={handleOpenDashboard}
        onToggleTheme={handleToggleTheme}
        circleOrientation={circleOrientation}
        onSwapOrientation={handleSwapOrientation}
        onManageMonitored={handleManageMonitored}
        onHideOverlay={handleHideOverlay}
        localTooltips={true}
        tooltipPlacement={resolvedTooltipPlacement}
        menuPlacement={placement}
      />
    </div>
  );
};
