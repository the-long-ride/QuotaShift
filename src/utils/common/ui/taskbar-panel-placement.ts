export type TaskbarEdge = "bottom" | "top" | "left" | "right";
export type PanelPlacement = "above" | "below" | "left" | "right";

export interface MonitorBounds {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export function normalizeTaskbarEdge(edge: unknown): TaskbarEdge {
  if (edge === "top" || edge === "left" || edge === "right") return edge;
  return "bottom";
}

export function isVerticalTaskbarEdge(edge: TaskbarEdge): boolean {
  return edge === "left" || edge === "right";
}

export function placementForTaskbarEdge(edge: TaskbarEdge): PanelPlacement {
  if (edge === "top") return "below";
  if (edge === "left") return "right";
  if (edge === "right") return "left";
  return "above";
}

/** Keeps a popup panel inside the target monitor (or screen fallback) with an 8px margin. */
export function clampPanelToBounds(
  bounds: MonitorBounds | null,
  targetX: number,
  targetY: number,
  width: number,
  height: number,
  scale: number,
  fallbackScreen?: { width: number; height: number },
): { x: number; y: number } {
  const margin = Math.round(8 * scale);
  const fit = (target: number, min: number, max: number) =>
    max >= min ? Math.max(min, Math.min(target, max)) : target;
  if (bounds) {
    const { position, size } = bounds;
    return {
      x: fit(targetX, position.x + margin, position.x + size.width - width - margin),
      y: fit(targetY, position.y + margin, position.y + size.height - height - margin),
    };
  }
  const availW =
    fallbackScreen?.width ??
    (typeof window !== "undefined" ? Math.round(window.screen.availWidth * scale) : 1920);
  const availH =
    fallbackScreen?.height ??
    (typeof window !== "undefined" ? Math.round(window.screen.availHeight * scale) : 1080);
  return {
    x: fit(targetX, margin, availW - width - margin),
    y: fit(targetY, margin, availH - height - margin),
  };
}

/** Computes the physical anchor point on the taskbar strip edge for a hovered/clicked item. */
export function computeTaskbarPanelAnchor(
  edge: TaskbarEdge,
  stripPos: { x: number; y: number },
  stripRect: {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
    width: number;
    height: number;
  },
  itemRect: { left: number; top: number; width: number; height: number },
  dpr: number,
  stripOuterSize?: { width: number; height: number } | null,
): { placement: PanelPlacement; anchorX: number; anchorY: number } {
  const placement = placementForTaskbarEdge(edge);
  const centerX = Math.round(stripPos.x + (itemRect.left + itemRect.width / 2) * dpr);
  const centerY = Math.round(stripPos.y + (itemRect.top + itemRect.height / 2) * dpr);
  if (placement === "below") {
    const stripBottomPx =
      stripOuterSize?.height ??
      Math.round((stripRect.bottom ?? (stripRect.top ?? 0) + stripRect.height) * dpr);
    return {
      placement,
      anchorX: centerX,
      anchorY: Math.round(stripPos.y + stripBottomPx),
    };
  }
  if (placement === "right") {
    const stripRightPx =
      stripOuterSize?.width ??
      Math.round((stripRect.right ?? (stripRect.left ?? 0) + stripRect.width) * dpr);
    return {
      placement,
      anchorX: Math.round(stripPos.x + stripRightPx),
      anchorY: centerY,
    };
  }
  if (placement === "left") {
    return {
      placement,
      anchorX: stripPos.x,
      anchorY: centerY,
    };
  }
  return {
    placement,
    anchorX: centerX,
    anchorY: stripPos.y,
  };
}

/** Places a popup panel adjacent to the taskbar anchor and clamps it to the monitor. */
export function computeAnchoredPanelPosition(params: {
  placement: PanelPlacement;
  anchorX: number;
  anchorY: number;
  panelWidth: number;
  panelHeight: number;
  gapPx: number;
  monitor: MonitorBounds | null;
  scale: number;
  fallbackScreen?: { width: number; height: number };
}): { x: number; y: number } {
  const { placement, anchorX, anchorY, panelWidth, panelHeight, gapPx, monitor, scale } = params;
  const gap = Math.round(gapPx * scale);
  let targetX = Math.round(anchorX - panelWidth / 2);
  let targetY = Math.round(anchorY - panelHeight - gap);

  if (placement === "below") {
    targetY = Math.round(anchorY + gap);
  } else if (placement === "right") {
    targetX = Math.round(anchorX + gap);
    targetY = Math.round(anchorY - panelHeight / 2);
  } else if (placement === "left") {
    targetX = Math.round(anchorX - panelWidth - gap);
    targetY = Math.round(anchorY - panelHeight / 2);
  }

  return clampPanelToBounds(
    monitor,
    targetX,
    targetY,
    panelWidth,
    panelHeight,
    scale,
    params.fallbackScreen,
  );
}
