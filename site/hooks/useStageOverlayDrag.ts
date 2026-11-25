import { useCallback, useEffect, useRef, useState } from "react";
import type { DependencyList, PointerEvent as ReactPointerEvent, RefObject } from "react";

export const DRAG_THRESHOLD_PX = 4;
const STAGE_PADDING_PX = 12;
const IGNORED_TARGET_SELECTOR =
  ".qs-overlay-hover-link, .qs-demo-empty-stage button, .overlay-nav-arrow";

export type StageOverlayOffset = { x: number; y: number };
type DragBounds = { minX: number; maxX: number; minY: number; maxY: number };

interface DragSession {
  pointerId: number;
  start: StageOverlayOffset;
  origin: StageOverlayOffset;
  bounds: DragBounds;
  dragging: boolean;
  captured: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function computeBounds(
  stage: HTMLElement,
  hud: HTMLElement,
  offset: StageOverlayOffset,
): DragBounds {
  const s = stage.getBoundingClientRect();
  const h = hud.getBoundingClientRect();
  const naturalLeft = h.left - s.left - offset.x;
  const naturalTop = h.top - s.top - offset.y;
  const minX = STAGE_PADDING_PX - naturalLeft;
  const minY = STAGE_PADDING_PX - naturalTop;
  return {
    minX,
    maxX: Math.max(minX, s.width - STAGE_PADDING_PX - h.width - naturalLeft),
    minY,
    maxY: Math.max(minY, s.height - STAGE_PADDING_PX - h.height - naturalTop),
  };
}

export function useStageOverlayDrag(
  stageRef: RefObject<HTMLElement | null>,
  hudRef: RefObject<HTMLElement | null>,
  deps: DependencyList = [],
) {
  const [offset, setOffset] = useState<StageOverlayOffset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const offsetRef = useRef(offset);
  const sessionRef = useRef<DragSession | null>(null);
  offsetRef.current = offset;

  const endDrag = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (session.captured) {
      try {
        hudRef.current?.releasePointerCapture(session.pointerId);
      } catch {
        // Capture already released.
      }
    }
    sessionRef.current = null;
    setIsDragging(false);
  }, [hudRef]);

  const clampOffset = useCallback(() => {
    if (!stageRef.current || !hudRef.current) return;
    const stageEl = stageRef.current;
    const hudEl = hudRef.current;
    setOffset((prev) => {
      if (prev.x === 0 && prev.y === 0) return prev;
      const b = computeBounds(stageEl, hudEl, prev);
      const x = clamp(prev.x, b.minX, b.maxX);
      const y = clamp(prev.y, b.minY, b.maxY);
      return x === prev.x && y === prev.y ? prev : { x, y };
    });
  }, [hudRef, stageRef]);

  useEffect(() => {
    window.addEventListener("blur", endDrag);
    return () => window.removeEventListener("blur", endDrag);
  }, [endDrag]);

  useEffect(() => {
    clampOffset();
    if (typeof ResizeObserver === "undefined" || (!stageRef.current && !hudRef.current)) return;
    const observer = new ResizeObserver(clampOffset);
    if (stageRef.current) observer.observe(stageRef.current);
    if (hudRef.current) observer.observe(hudRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampOffset, stageRef, hudRef, ...deps]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if ((e.target as HTMLElement | null)?.closest(IGNORED_TARGET_SELECTOR)) return;
      if (!stageRef.current || !hudRef.current) return;
      const current = offsetRef.current;
      sessionRef.current = {
        pointerId: e.pointerId,
        start: { x: e.clientX, y: e.clientY },
        origin: current,
        bounds: computeBounds(stageRef.current, hudRef.current, current),
        dragging: false,
        captured: false,
      };
    },
    [hudRef, stageRef],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      const dx = e.clientX - session.start.x;
      const dy = e.clientY - session.start.y;
      if (!session.dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        session.dragging = true;
        try {
          hudRef.current?.setPointerCapture(e.pointerId);
          session.captured = true;
        } catch {
          session.captured = false;
        }
        setIsDragging(true);
      }
      setOffset({
        x: clamp(session.origin.x + dx, session.bounds.minX, session.bounds.maxX),
        y: clamp(session.origin.y + dy, session.bounds.minY, session.bounds.maxY),
      });
    },
    [hudRef],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (sessionRef.current?.pointerId === e.pointerId) endDrag();
    },
    [endDrag],
  );

  const resetPosition = useCallback(() => {
    endDrag();
    setOffset({ x: 0, y: 0 });
  }, [endDrag]);

  return {
    offset,
    isDragging,
    hasMoved: offset.x !== 0 || offset.y !== 0,
    resetPosition,
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
