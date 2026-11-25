import React, { useEffect, useMemo, useState } from "react";
import { TaskbarColumn } from "../../../src/components/taskbar/TaskbarColumn";
import { TaskbarTooltipCard } from "../../../src/components/taskbar/TaskbarTooltipCard";
import {
  buildTaskbarColumns,
  type TaskbarColumn as Column,
} from "../../../src/utils/common/ui/taskbar-columns";
import {
  isVerticalTaskbarEdge,
  placementForTaskbarEdge,
  type TaskbarEdge,
} from "../../../src/utils/common/ui/taskbar-panel-placement";
import type { OverlayTheme } from "../../../src/utils/common/ui/ui-adjustment";
import type { DemoCoordinator } from "../../hooks/useDemoCoordinator";
import { HudDemoContextMenu } from "./HudDemoContextMenu";

export interface TaskbarDemoSurfaceProps {
  coord: DemoCoordinator;
}

const TASKBAR_EDGE_OPTIONS: Array<{ id: TaskbarEdge; label: string }> = [
  { id: "bottom", label: "Bottom" },
  { id: "top", label: "Top" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
];

const STRIP_THEME_OPTIONS: Array<{ id: OverlayTheme; label: string }> = [
  { id: "glassmorphism", label: "Glass" },
  { id: "mono", label: "Mono" },
];

export const TaskbarDemoSurface: React.FC<TaskbarDemoSurfaceProps> = ({ coord }) => {
  const columns = useMemo(
    () => buildTaskbarColumns(coord.primaryOverlayData),
    [coord.primaryOverlayData],
  );
  const [hoveredKey, setHoveredKey] = useState<string | null>(() => columns[0]?.key ?? null);
  const [menuColumnKey, setMenuColumnKey] = useState<string | null>(null);
  const [isStripHidden, setIsStripHidden] = useState(false);
  const [edge, setEdge] = useState<TaskbarEdge>("bottom");
  const [hudTheme, setHudTheme] = useState<OverlayTheme>("glassmorphism");

  const vertical = isVerticalTaskbarEdge(edge);
  const placement = placementForTaskbarEdge(edge);

  useEffect(() => {
    if (columns.length === 0) {
      setHoveredKey(null);
      setMenuColumnKey(null);
      return;
    }
    if (!hoveredKey || !columns.some((col) => col.key === hoveredKey)) {
      setHoveredKey(columns[0].key);
    }
    if (menuColumnKey && !columns.some((col) => col.key === menuColumnKey)) {
      setMenuColumnKey(null);
    }
  }, [columns, hoveredKey, menuColumnKey]);

  useEffect(() => {
    if (coord.toast?.message === "Demo data reset to defaults") {
      setIsStripHidden(false);
      setMenuColumnKey(null);
    }
  }, [coord.toast?.id, coord.toast?.message]);

  const activeColumn = useMemo(
    () => columns.find((col) => col.key === hoveredKey) ?? columns[0] ?? null,
    [columns, hoveredKey],
  );

  const menuColumn = useMemo(
    () => columns.find((col) => col.key === menuColumnKey) ?? null,
    [columns, menuColumnKey],
  );

  const handleOpenColumn = (column: Column) => {
    setMenuColumnKey(null);
    coord.setActiveTab(column.provider);
    coord.setActiveSurface("dashboard");
  };

  const handleColumnMenu = (column: Column) => {
    setHoveredKey(column.key);
    setMenuColumnKey((prev) => (prev === column.key ? null : column.key));
  };

  return (
    <div className="qs-taskbar-demo">
      <div className="qs-demo-toolbar" role="toolbar" aria-label="Windows taskbar controls">
        <div className="qs-demo-toolbar-group">
          <span className="qs-demo-toolbar-label">Taskbar Position</span>
          <div className="qs-demo-segmented">
            {TASKBAR_EDGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`qs-demo-seg-btn${edge === opt.id ? " qs-demo-seg-btn--active" : ""}`}
                aria-pressed={edge === opt.id}
                onClick={() => {
                  setEdge(opt.id);
                  setMenuColumnKey(null);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="qs-demo-toolbar-group">
          <span className="qs-demo-toolbar-label">Strip Theme</span>
          <div className="qs-demo-segmented">
            {STRIP_THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`qs-demo-seg-btn${hudTheme === opt.id ? " qs-demo-seg-btn--active" : ""}`}
                aria-pressed={hudTheme === opt.id}
                onClick={() => setHudTheme(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="qs-demo-toolbar-actions">
          <button
            type="button"
            className={`qs-demo-reset-pos-btn qs-demo-menu-trigger${menuColumn ? " qs-demo-seg-btn--active" : ""}`}
            disabled={columns.length === 0 || isStripHidden}
            onClick={() => {
              if (menuColumn) {
                setMenuColumnKey(null);
              } else if (activeColumn) {
                setMenuColumnKey(activeColumn.key);
              }
            }}
          >
            Context Menu
          </button>
        </div>
      </div>

      <div
        className="qs-taskbar-stage"
        data-edge={edge}
        data-placement={placement}
        data-overlay-theme={hudTheme}
        data-theme={coord.isDarkMode ? "dark" : "light"}
      >
        <div className="qs-taskbar-desktop">
          <div className="qs-taskbar-desktop-badge">Windows 11 Taskbar Integration</div>

          <div className="qs-taskbar-tooltip-area">
            {isStripHidden ? (
              <div className="qs-demo-empty-stage">
                <p>Taskbar strip hidden</p>
                <button
                  type="button"
                  className="qs-btn qs-btn--primary"
                  onClick={() => setIsStripHidden(false)}
                >
                  Restore Taskbar Strip
                </button>
              </div>
            ) : menuColumn ? (
              <div className="qs-taskbar-menu-anchor">
                <HudDemoContextMenu
                  isOpen={true}
                  coord={coord}
                  target={{ provider: menuColumn.provider, accountId: menuColumn.accountId }}
                  overlayTheme={hudTheme}
                  placement={placement}
                  onHide={() => setIsStripHidden(true)}
                  onClose={() => setMenuColumnKey(null)}
                />
              </div>
            ) : activeColumn ? (
              <div className="qs-taskbar-tooltip-anchor">
                <TaskbarTooltipCard details={activeColumn.details} />
              </div>
            ) : (
              <div className="qs-demo-empty-stage">
                <p>No tracked accounts to show on the taskbar strip.</p>
                <button
                  type="button"
                  className="qs-btn qs-btn--primary"
                  onClick={coord.onResetDemo}
                >
                  Reset Demo Accounts
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="qs-win11-taskbar" role="region" aria-label="Simulated Windows 11 taskbar">
          <div className="qs-win11-left" aria-hidden="true">
            <span className="qs-win11-start" title="Start" />
            <span className="qs-win11-app-pill" />
            <span className="qs-win11-app-pill" />
          </div>

          <div className="qs-win11-quotashift">
            {!isStripHidden && (
              <div
                className="taskbar-root"
                data-overlay-theme={hudTheme}
                data-theme={coord.isDarkMode ? "dark" : "light"}
                data-taskbar-edge={edge}
              >
                <div
                  className="taskbar-strip"
                  data-columns={columns.length}
                  data-visible-columns={columns.length}
                >
                  {columns.length > 0 ? (
                    columns.map((column) => (
                      <div
                        key={column.key}
                        className={`qs-taskbar-col-wrap${
                          (menuColumn?.key ?? activeColumn?.key) === column.key
                            ? " qs-taskbar-col-wrap--active"
                            : ""
                        }`}
                        onFocus={() => setHoveredKey(column.key)}
                      >
                        <TaskbarColumn
                          column={column}
                          vertical={vertical}
                          onHover={(col) => setHoveredKey(col.key)}
                          onLeave={() => {}}
                          onMenu={handleColumnMenu}
                          onOpen={handleOpenColumn}
                        />
                      </div>
                    ))
                  ) : (
                    <button type="button" className="taskbar-empty" onClick={coord.onResetDemo}>
                      QuotaShift
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="qs-win11-tray" aria-hidden="true">
            <span className="qs-win11-clock">10:42 AM</span>
          </div>
        </div>
      </div>
    </div>
  );
};
