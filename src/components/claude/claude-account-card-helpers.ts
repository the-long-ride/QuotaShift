import type React from "react";

export interface ClaudeCardReorderBindings {
  containerRef: React.RefObject<HTMLDivElement | null>;
  draggingId: string | null;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, id: string) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  consumeClickSuppression: () => boolean;
}
