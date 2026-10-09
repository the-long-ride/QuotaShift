import { useLayoutEffect, useRef, type RefObject } from "react";

const SLIDE_MS = 240;
const SLIDE_EASING = "cubic-bezier(0.22, 0.9, 0.3, 1)";
/** How far a column that scrolls into view travels, in layout px. */
const ENTER_OFFSET_PX = 14;

/**
 * Animates the strip when the visible window of accounts moves: columns that stay glide from
 * their old spot to the new one, the one scrolling in fades and slides from the scroll side.
 * Positions use `offsetLeft`, which ignores transforms and the leaked page zoom.
 */
export function useTaskbarSlide(stripRef: RefObject<HTMLElement | null>, startIndex: number): void {
  const lastLeft = useRef(new Map<string, number>());
  const lastIndex = useRef(startIndex);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const columns = Array.from(strip.querySelectorAll<HTMLElement>("[data-slide-key]"));
    const next = new Map<string, number>();
    for (const column of columns) next.set(column.dataset.slideKey ?? "", column.offsetLeft);

    const moved = startIndex !== lastIndex.current;
    const direction = startIndex > lastIndex.current ? 1 : -1;
    lastIndex.current = startIndex;
    const previous = lastLeft.current;
    lastLeft.current = next;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!moved || reduced || typeof Element.prototype.animate !== "function") return;

    for (const column of columns) {
      const before = previous.get(column.dataset.slideKey ?? "");
      const options = { duration: SLIDE_MS, easing: SLIDE_EASING, fill: "backwards" as const };
      if (before === undefined) {
        column.animate(
          [
            { opacity: 0, transform: `translateX(${direction * ENTER_OFFSET_PX}px) scale(0.92)` },
            { opacity: 1, transform: "translateX(0) scale(1)" },
          ],
          options,
        );
      } else if (before !== column.offsetLeft) {
        column.animate(
          [{ transform: `translateX(${before - column.offsetLeft}px)` }, { transform: "none" }],
          options,
        );
      }
    }
  });
}
