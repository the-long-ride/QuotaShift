import React, { useMemo, useRef, useState } from "react";
import { PointerReorderController, SortableCardRect } from "../utils/pointer-reorder";

export function usePointerCardReorder<T extends { id: string }>(
  items: T[],
  onReorder: (orderedIds: string[]) => void,
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef(new PointerReorderController(4));

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
        };
      })
      .filter((rect) => Boolean(rect.id));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    controllerRef.current.begin(
      id,
      event.pointerId,
      event.clientX,
      event.clientY,
      items.map((item) => item.id),
    );
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const controller = controllerRef.current;
    if (!controller.ownsPointer(event.pointerId)) return;
    const update = controller.move(event.clientX, event.clientY, collectCardRects());
    if (!update.dragging) return;
    event.preventDefault();
    setDraggingId(update.sourceId);
    setPreviewIds(update.ids);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const controller = controllerRef.current;
    if (!controller.ownsPointer(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const result = controller.finish();
    setDraggingId(null);
    setPreviewIds(null);
    if (result.committedIds) onReorder(result.committedIds);
  };

  const handlePointerCancel = () => {
    controllerRef.current.cancel();
    setDraggingId(null);
    setPreviewIds(null);
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
