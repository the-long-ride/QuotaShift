import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { OverlayAccountData } from "../../src/components/overlay/OverlayApp";
import {
  TASKBAR_TOOLTIP_EXIT_MS,
  TASKBAR_TOOLTIP_LEAVE_GRACE_MS,
} from "../../src/components/taskbar/TaskbarTooltipCard";
import type { CircleOrientation } from "../../src/utils/common/overlay/circle-layout";
import {
  buildTaskbarColumns,
  type TaskbarTooltipDetails,
} from "../../src/utils/common/ui/taskbar-columns";
import {
  computeAnchoredPanelPosition,
  type PanelPlacement,
} from "../../src/utils/common/ui/taskbar-panel-placement";

export interface StageTooltipPosition {
  x: number;
  y: number;
  placement: PanelPlacement;
  ready: boolean;
}

export interface UseStageOverlayTooltipOptions {
  stageRef: RefObject<HTMLElement | null>;
  cardRef: RefObject<HTMLDivElement | null>;
  orientation: CircleOrientation;
  suppressed: boolean;
  repositionDeps: readonly unknown[];
}

const GAP_PX = 6;
const MARGIN_PX = 8;
const INITIAL_POS: StageTooltipPosition = { x: 0, y: 0, placement: "right", ready: false };

function computeStageTooltipPos(
  stageRect: DOMRect,
  itemRect: DOMRect,
  cardEl: HTMLDivElement | null,
  orientation: CircleOrientation,
): StageTooltipPosition {
  const panelWidth = cardEl?.offsetWidth || 272;
  const panelHeight = Math.max(cardEl?.offsetHeight ?? 0, cardEl?.scrollHeight ?? 0) || 184;
  const relLeft = itemRect.left - stageRect.left;
  const relRight = itemRect.right - stageRect.left;
  const relTop = itemRect.top - stageRect.top;
  const relBottom = itemRect.bottom - stageRect.top;
  const isVertical = orientation === "vertical";
  const flip = isVertical
    ? relRight + GAP_PX + panelWidth + MARGIN_PX > stageRect.width &&
      relLeft > stageRect.width - relRight
    : relBottom + GAP_PX + panelHeight + MARGIN_PX > stageRect.height &&
      relTop > stageRect.height - relBottom;

  const placement: PanelPlacement = isVertical
    ? flip
      ? "left"
      : "right"
    : flip
      ? "above"
      : "below";
  const anchorX = isVertical ? (flip ? relLeft : relRight) : relLeft + itemRect.width / 2;
  const anchorY = isVertical ? relTop + itemRect.height / 2 : flip ? relTop : relBottom;
  const monitor = {
    position: { x: 0, y: 0 },
    size: { width: stageRect.width, height: stageRect.height },
  };
  const { x, y } = computeAnchoredPanelPosition({
    placement,
    anchorX,
    anchorY,
    panelWidth,
    panelHeight,
    gapPx: GAP_PX,
    monitor,
    scale: 1,
  });

  return { x, y, placement, ready: true };
}

export function useStageOverlayTooltip({
  stageRef,
  cardRef,
  orientation,
  suppressed,
  repositionDeps,
}: UseStageOverlayTooltipOptions) {
  const [hoverItem, setHoverItem] = useState<{
    key: string;
    details: TaskbarTooltipDetails;
    element: HTMLElement;
  } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [pos, setPos] = useState<StageTooltipPosition>(INITIAL_POS);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }, []);

  const clearImmediate = useCallback(() => {
    clearTimers();
    setHoverItem(null);
    setLeaving(false);
    setPos((prev) => (prev.ready ? { ...prev, ready: false } : prev));
  }, [clearTimers]);

  useEffect(() => {
    if (suppressed) clearImmediate();
  }, [suppressed, clearImmediate]);

  useEffect(() => clearTimers, [clearTimers]);

  const onHover = useCallback(
    (card: OverlayAccountData, element: HTMLElement) => {
      if (suppressed) return;
      clearTimers();
      setLeaving((prev) => (prev ? false : prev));
      const details = buildTaskbarColumns(card)[0]?.details;
      if (!details) return;
      const key = `${card.provider}:${card.accountId ?? card.label ?? ""}`;
      setHoverItem((prev) =>
        prev && prev.key === key && prev.element === element ? prev : { key, details, element },
      );
    },
    [suppressed, clearTimers],
  );

  const onLeave = useCallback(() => {
    clearTimers();
    const graceId = window.setTimeout(() => {
      setLeaving(true);
      const exitId = window.setTimeout(() => {
        setHoverItem(null);
        setLeaving(false);
      }, TASKBAR_TOOLTIP_EXIT_MS);
      timersRef.current.push(exitId);
    }, TASKBAR_TOOLTIP_LEAVE_GRACE_MS);
    timersRef.current.push(graceId);
  }, [clearTimers]);

  useLayoutEffect(() => {
    const stageEl = stageRef.current;
    if (!hoverItem || !stageEl) return;

    const updatePosition = () => {
      const stageRect = stageEl.getBoundingClientRect();
      const itemRect = hoverItem.element.getBoundingClientRect();
      if (itemRect.width === 0 && itemRect.height === 0) {
        clearImmediate();
        return;
      }
      const next = computeStageTooltipPos(stageRect, itemRect, cardRef.current, orientation);
      setPos((prev) =>
        prev.ready && prev.x === next.x && prev.y === next.y && prev.placement === next.placement
          ? prev
          : next,
      );
    };

    updatePosition();
    const cardEl = cardRef.current;
    if (typeof ResizeObserver === "undefined" || !cardEl) return;
    const observer = new ResizeObserver(updatePosition);
    observer.observe(cardEl);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverItem, orientation, stageRef, cardRef, clearImmediate, ...repositionDeps]);

  return {
    tooltipDetails: hoverItem?.details ?? null,
    leaving,
    pos,
    onHover,
    onLeave,
    clearImmediate,
  };
}
