import type React from "react";
import { useEffect, useState } from "react";

export interface FloatingDragState {
  id: string;
  height: number;
  offsetY: number;
  pointerY: number;
  listTop: number;
}

export function useFloatingDragRow(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onPointerDownReorder: (event: React.PointerEvent<HTMLDivElement>, id: string) => void,
) {
  const [dragFloat, setDragFloat] = useState<FloatingDragState | null>(null);
  const isTrackingPointer = dragFloat !== null;

  useEffect(() => {
    if (!isTrackingPointer) return;
    const onMove = (event: PointerEvent) => {
      const listTop = containerRef.current?.getBoundingClientRect().top ?? 0;
      setDragFloat((prev) => (prev ? { ...prev, pointerY: event.clientY, listTop } : null));
    };
    const onEnd = () => setDragFloat(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [containerRef, isTrackingPointer]);

  const handleRowPointerDown = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (event.button === 0) {
      const rect = event.currentTarget.getBoundingClientRect();
      const listTop = containerRef.current?.getBoundingClientRect().top ?? rect.top;
      setDragFloat({
        id,
        height: rect.height,
        offsetY: event.clientY - rect.top,
        pointerY: event.clientY,
        listTop,
      });
    }
    onPointerDownReorder(event, id);
  };

  return {
    dragFloat,
    clearDragFloat: () => setDragFloat(null),
    handleRowPointerDown,
  };
}
