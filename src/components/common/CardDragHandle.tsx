import React from "react";

interface CardDragHandleProps {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
}

export const CardDragHandle: React.FC<CardDragHandleProps> = ({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}) => (
  <div
    className="card-drag-handle"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerCancel}
    onLostPointerCapture={onPointerCancel}
    onClick={(e) => e.stopPropagation()}
    data-tooltip="Drag to reorder"
  >
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12">
      <circle cx="8" cy="6" r="1.5" fill="currentColor" />
      <circle cx="16" cy="6" r="1.5" fill="currentColor" />
      <circle cx="8" cy="12" r="1.5" fill="currentColor" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" />
      <circle cx="8" cy="18" r="1.5" fill="currentColor" />
      <circle cx="16" cy="18" r="1.5" fill="currentColor" />
    </svg>
  </div>
);
