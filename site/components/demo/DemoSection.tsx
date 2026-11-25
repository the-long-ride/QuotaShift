import React from "react";
import { Toast } from "../../../src/components/common/Toast";
import { DashboardDemoSurface } from "./DashboardDemoSurface";
import { OverlayDemoSurface } from "./OverlayDemoSurface";
import { TaskbarDemoSurface } from "./TaskbarDemoSurface";
import type { DemoCoordinator } from "../../hooks/useDemoCoordinator";

export interface DemoSectionProps {
  coord: DemoCoordinator;
}

export function DemoSegmentedGroup<T extends string>({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: Array<[T, string]>;
  active: T;
  onSelect: (val: T) => void;
}) {
  return (
    <div className="qs-demo-toolbar-group">
      <span className="qs-demo-toolbar-label">{label}</span>
      <div className="qs-demo-segmented">
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            className={`qs-demo-seg-btn${active === id ? " qs-demo-seg-btn--active" : ""}`}
            onClick={() => onSelect(id)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

const SURFACE_TABS: Array<{
  id: DemoCoordinator["activeSurface"];
  label: string;
  tip: string;
}> = [
  {
    id: "dashboard",
    label: "Main Dashboard",
    tip: "Try switching tabs, pinning accounts to the HUD, renaming labels, searching, or toggling Codex Model Pools.",
  },
  {
    id: "overlay",
    label: "Desktop Overlay HUD",
    tip: "Drag the HUD around the workspace, right-click any card or circle (or use Context Menu) for quick actions, switch between Card Stack and Circle Nodes, or preview Glass vs Mono themes.",
  },
  {
    id: "taskbar",
    label: "Windows Taskbar",
    tip: "Switch between Bottom, Top, Left, and Right taskbar positions or Glass and Mono themes, hover to inspect live quota cards, click or right-click any account for the context menu, or double-click to open it in the dashboard.",
  },
];

export const DemoSection: React.FC<DemoSectionProps> = ({ coord }) => {
  const activeTabMeta =
    SURFACE_TABS.find((tab) => tab.id === coord.activeSurface) ?? SURFACE_TABS[0];

  return (
    <section id="demo" className="qs-section qs-demo-section">
      <div className="qs-demo-header">
        <div className="qs-demo-title-group">
          <h2 className="qs-section-title">Interactive Live Demo</h2>
          <span className="qs-tracked-badge">{coord.trackedCount} tracked in HUD</span>
        </div>

        <div className="qs-demo-header-actions">
          <button type="button" className="qs-btn qs-btn--secondary" onClick={coord.onResetDemo}>
            Reset Demo
          </button>
        </div>
      </div>

      <div className="qs-demo-switcher" role="tablist" aria-label="Demo surfaces">
        {SURFACE_TABS.map((tab) => {
          const selected = coord.activeSurface === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`qs-demo-switcher-btn${selected ? " qs-demo-switcher-btn--active" : ""}`}
              onClick={() => coord.setActiveSurface(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="qs-demo-tip" role="note">
        <span>{activeTabMeta.tip}</span>
      </div>

      <div className="qs-demo-surface-panel" role="tabpanel">
        {coord.activeSurface === "dashboard" ? (
          <DashboardDemoSurface coord={coord} />
        ) : coord.activeSurface === "overlay" ? (
          <OverlayDemoSurface coord={coord} />
        ) : (
          <TaskbarDemoSurface coord={coord} />
        )}
        {coord.activeSurface !== "dashboard" && coord.toast && (
          <Toast toast={coord.toast} onDismiss={coord.dismissToast} />
        )}
      </div>
    </section>
  );
};
