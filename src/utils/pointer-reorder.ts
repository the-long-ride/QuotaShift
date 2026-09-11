export interface SortableCardRect {
  id: string;
  top: number;
  bottom: number;
}

export interface PointerReorderUpdate {
  dragging: boolean;
  ids: string[];
  sourceId: string | null;
}

export interface PointerReorderFinish {
  committedIds: string[] | null;
  sourceId: string | null;
}

export function reorderIdsAtPointer(
  ids: string[],
  sourceId: string,
  rects: SortableCardRect[],
  pointerY: number,
): string[] {
  if (!ids.includes(sourceId) || ids.length < 2) return [...ids];

  const orderedRects = rects
    .filter((rect) => ids.includes(rect.id) && rect.id !== sourceId)
    .sort((a, b) => a.top - b.top);

  const remaining = ids.filter((id) => id !== sourceId);
  let insertAt = remaining.length;
  for (const rect of orderedRects) {
    const midpoint = rect.top + (rect.bottom - rect.top) / 2;
    if (pointerY < midpoint) {
      const targetIndex = remaining.indexOf(rect.id);
      if (targetIndex >= 0) insertAt = targetIndex;
      break;
    }
  }

  const next = [...remaining];
  next.splice(insertAt, 0, sourceId);
  return next;
}

export class PointerReorderController {
  private readonly threshold: number;
  private sourceId: string | null = null;
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private dragging = false;
  private originalIds: string[] = [];
  private previewIds: string[] = [];
  private suppressClick = false;
  private cancelled = false;

  constructor(threshold = 4) {
    this.threshold = threshold;
  }

  begin(sourceId: string, pointerId: number, x: number, y: number, ids: string[]): void {
    this.sourceId = sourceId;
    this.pointerId = pointerId;
    this.startX = x;
    this.startY = y;
    this.dragging = false;
    this.originalIds = [...ids];
    this.previewIds = [...ids];
    this.cancelled = false;
  }

  ownsPointer(pointerId: number): boolean {
    return this.pointerId === pointerId;
  }

  move(x: number, y: number, rects: SortableCardRect[]): PointerReorderUpdate {
    if (!this.sourceId || this.cancelled) {
      return { dragging: false, ids: [...this.previewIds], sourceId: null };
    }

    if (!this.dragging) {
      const distance = Math.hypot(x - this.startX, y - this.startY);
      if (distance < this.threshold) {
        return { dragging: false, ids: [...this.previewIds], sourceId: this.sourceId };
      }
      this.dragging = true;
    }

    this.previewIds = reorderIdsAtPointer(this.previewIds, this.sourceId, rects, y);
    return { dragging: true, ids: [...this.previewIds], sourceId: this.sourceId };
  }

  finish(): PointerReorderFinish {
    const sourceId = this.sourceId;
    const changed =
      this.dragging &&
      !this.cancelled &&
      this.previewIds.length === this.originalIds.length &&
      this.previewIds.some((id, index) => id !== this.originalIds[index]);
    const committedIds = changed ? [...this.previewIds] : null;
    if (this.dragging && !this.cancelled) this.suppressClick = true;
    this.resetActive();
    return { committedIds, sourceId };
  }

  cancel(): void {
    this.cancelled = true;
    this.resetActive();
  }

  consumeClickSuppression(): boolean {
    if (!this.suppressClick) return false;
    this.suppressClick = false;
    return true;
  }

  private resetActive(): void {
    this.sourceId = null;
    this.pointerId = null;
    this.dragging = false;
    this.originalIds = [];
    this.previewIds = [];
  }
}
