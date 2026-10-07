import { PhysicalPosition } from "@tauri-apps/api/dpi";
import type { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor, monitorFromPoint, type Monitor } from "@tauri-apps/api/window";

type TooltipWindow = ReturnType<typeof getCurrentWebviewWindow>;

/**
 * Monitor under the taskbar anchor (physical px). The tooltip window's own monitor is only where
 * it was last shown, so it is stale once the primary taskbar moves to another display.
 */
export async function anchorMonitor(anchorX: number, anchorY: number): Promise<Monitor | null> {
  try {
    return (await monitorFromPoint(anchorX, anchorY)) ?? (await currentMonitor());
  } catch {
    return null;
  }
}

const samePlace = (a: Monitor, b: Monitor) =>
  a.position.x === b.position.x && a.position.y === b.position.y;

/**
 * Moves a not-yet-placed window onto the anchor monitor so the following logical `setSize` and
 * `outerSize` use that monitor's DPI scale instead of the one the window was last on.
 */
export async function moveOntoMonitor(win: TooltipWindow, monitor: Monitor | null): Promise<void> {
  if (!monitor) return;
  const current = await currentMonitor().catch(() => null);
  if (current && samePlace(current, monitor)) return;
  await win.setPosition(new PhysicalPosition(monitor.position.x, monitor.position.y));
}

/** Keeps the window inside `monitor` (or the page's screen when the monitor is unknown). */
export function clampToMonitor(
  monitor: Monitor | null,
  targetX: number,
  targetY: number,
  width: number,
  height: number,
  scale: number,
): { x: number; y: number } {
  const margin = Math.round(8 * scale);
  const fit = (target: number, min: number, max: number) =>
    max >= min ? Math.max(min, Math.min(target, max)) : target;
  if (monitor) {
    const { position, size } = monitor;
    return {
      x: fit(targetX, position.x + margin, position.x + size.width - width - margin),
      y: fit(targetY, position.y + margin, position.y + size.height - height - margin),
    };
  }
  return {
    x: fit(targetX, margin, Math.round(window.screen.availWidth * scale) - width - margin),
    y: fit(targetY, margin, Math.round(window.screen.availHeight * scale) - height - margin),
  };
}
