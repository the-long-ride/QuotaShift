import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor, primaryMonitor, availableMonitors } from "@tauri-apps/api/window";

export interface MonitorRectInfo {
  workArea?: { position: { x: number; y: number }; size: { width: number; height: number } };
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export function isPositionOnActiveMonitor(
  pos: { x: number; y: number },
  winSize: { width: number; height: number },
  monitors: MonitorRectInfo[],
): boolean {
  if (!monitors || monitors.length === 0) return false;
  return monitors.some((m) => {
    const workPos = m.workArea?.position ?? m.position;
    const workSize = m.workArea?.size ?? m.size;
    const overlapX = pos.x + winSize.width > workPos.x && pos.x < workPos.x + workSize.width;
    const overlapY = pos.y + winSize.height > workPos.y && pos.y < workPos.y + workSize.height;
    return overlapX && overlapY;
  });
}

export async function getPrimaryMonitorBottomRight(customWinSize?: {
  width: number;
  height: number;
}): Promise<{ x: number; y: number } | null> {
  try {
    const win = getCurrentWebviewWindow();
    const winSize = customWinSize ?? (await win.outerSize());
    const monitor = (await primaryMonitor()) ?? (await currentMonitor());
    if (!monitor) return null;
    const pad = Math.round(16 * (monitor.scaleFactor ?? 1));
    const workPos = monitor.workArea?.position ?? monitor.position;
    const workSize = monitor.workArea?.size ?? monitor.size;
    return {
      x: workPos.x + workSize.width - winSize.width - pad,
      y: workPos.y + workSize.height - winSize.height - pad,
    };
  } catch {
    return null;
  }
}

export async function clampPositionToScreen(targetPos: {
  x: number;
  y: number;
}): Promise<{ x: number; y: number } | null> {
  try {
    const win = getCurrentWebviewWindow(),
      winSize = await win.outerSize(),
      monitors = (await availableMonitors()) || [];
    if (monitors.length > 0) {
      if (!isPositionOnActiveMonitor(targetPos, winSize, monitors)) {
        return await getPrimaryMonitorBottomRight(winSize);
      }
      const boxes = monitors.map((m) => ({
        pos: m.workArea?.position ?? m.position,
        size: m.workArea?.size ?? m.size,
      }));
      const minX = Math.min(...boxes.map((b) => b.pos.x)),
        maxX = Math.max(...boxes.map((b) => b.pos.x + b.size.width)) - winSize.width;
      const minY = Math.min(...boxes.map((b) => b.pos.y)),
        maxY = Math.max(...boxes.map((b) => b.pos.y + b.size.height)) - winSize.height;
      return {
        x: Math.max(minX, Math.min(maxX, targetPos.x)),
        y: Math.max(minY, Math.min(maxY, targetPos.y)),
      };
    }
    const monitor = (await currentMonitor()) ?? (await primaryMonitor());
    if (!monitor) return null;
    const pad = Math.round(6 * (monitor.scaleFactor ?? 1)),
      workPos = monitor.workArea?.position ?? monitor.position,
      workSize = monitor.workArea?.size ?? monitor.size;
    return {
      x: Math.max(
        workPos.x + pad,
        Math.min(workPos.x + workSize.width - winSize.width - pad, targetPos.x),
      ),
      y: Math.max(
        workPos.y + pad,
        Math.min(workPos.y + workSize.height - winSize.height - pad, targetPos.y),
      ),
    };
  } catch {
    return null;
  }
}
