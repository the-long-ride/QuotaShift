import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

type ResizeDirection =
  "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

const DIRECTIONS: ResizeDirection[] = [
  "North",
  "South",
  "East",
  "West",
  "NorthEast",
  "NorthWest",
  "SouthEast",
  "SouthWest",
];

export const WindowResizeHandles: React.FC = () => {
  const win = getCurrentWindow();

  const startResize = async (
    direction: ResizeDirection,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    try {
      if (await win.isMaximized()) return;
      await win.startResizeDragging(direction);
    } catch {}
  };

  return (
    <div className="window-resize-handles" aria-hidden="true" data-no-window-drag>
      {DIRECTIONS.map((direction) => (
        <div
          key={direction}
          data-no-window-drag
          className={`window-resize-handle window-resize-handle--${direction.toLowerCase()}`}
          onMouseDown={(event) => {
            void startResize(direction, event);
          }}
        />
      ))}
    </div>
  );
};
