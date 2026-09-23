import React, { useEffect, useMemo, useRef, useState } from "react";
import { PointerReorderController, SortableCardRect } from "../../utils/account/pointer-reorder";

export function usePointerCardReorder<T extends { id: string }>(
  items: T[],
  onReorder: (orderedIds: string[]) => void,
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef(new PointerReorderController(4));
  const activeDragRef = useRef<{ pointerId: number; cleanup: () => void } | null>(null);

  const displayedItems = useMemo(() => {
    if (!previewIds) return items;
    const byId = new Map(items.map((item) => [item.id, item]));
    return previewIds.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
  }, [items, previewIds]);

  const collectCardRects = (): SortableCardRect[] => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>("[data-sortable-account-id]"),
    )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.dataset.sortableAccountId || "",
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        };
      })
      .filter((rect) => Boolean(rect.id));
  };

  const endDrag = (commit: boolean) => {
    if (activeDragRef.current) {
      activeDragRef.current.cleanup();
      activeDragRef.current = null;
    }
    const controller = controllerRef.current;
    if (commit) {
      const result = controller.finish();
      setDraggingId(null);
      setPreviewIds(null);
      if (result.committedIds) onReorder(result.committedIds);
    } else {
      controller.cancel();
      setDraggingId(null);
      setPreviewIds(null);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();

    if (activeDragRef.current) {
      activeDragRef.current.cleanup();
      activeDragRef.current = null;
    }

    const initialRects = collectCardRects();
    const srcRect = initialRects.find((r) => r.id === id);
    const grabOffsetY = srcRect ? event.clientY - srcRect.top : undefined;
    const grabOffsetX = srcRect?.left !== undefined ? event.clientX - srcRect.left : undefined;

    controllerRef.current.begin(
      id,
      event.pointerId,
      event.clientX,
      event.clientY,
      items.map((item) => item.id),
      initialRects,
      grabOffsetY,
      grabOffsetX,
    );

    const onPointerMove = (e: PointerEvent) => {
      const controller = controllerRef.current;
      if (!controller.ownsPointer(e.pointerId)) return;
      const update = controller.move(e.clientX, e.clientY);
      if (!update.dragging) return;
      e.preventDefault();
      setDraggingId(update.sourceId);
      setPreviewIds(update.ids);
    };

    const onPointerUp = (e: PointerEvent) => {
      const controller = controllerRef.current;
      if (!controller.ownsPointer(e.pointerId)) return;
      endDrag(true);
    };

    const onPointerCancel = (e: PointerEvent) => {
      const controller = controllerRef.current;
      if (!controller.ownsPointer(e.pointerId)) return;
      endDrag(false);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);

    activeDragRef.current = { pointerId: event.pointerId, cleanup };
  };

  useEffect(() => {
    return () => {
      if (activeDragRef.current) {
        activeDragRef.current.cleanup();
        activeDragRef.current = null;
      }
    };
  }, []);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const controller = controllerRef.current;
    if (!controller.ownsPointer(event.pointerId)) return;
    const update = controller.move(event.clientX, event.clientY);
    if (!update.dragging) return;
    event.preventDefault();
    setDraggingId(update.sourceId);
    setPreviewIds(update.ids);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const controller = controllerRef.current;
    if (!controller.ownsPointer(event.pointerId)) return;
    endDrag(true);
  };

  const handlePointerCancel = () => {
    endDrag(false);
  };

  return {
    draggingId,
    previewIds,
    containerRef,
    controllerRef,
    displayedItems,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
