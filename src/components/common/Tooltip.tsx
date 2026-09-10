import React, { useEffect, useState, useRef } from "react";

export const Tooltip: React.FC = () => {
  const [text, setText] = useState<string | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [visible, setVisible] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let activeTarget: HTMLElement | null = null;

    const showTooltip = (target: HTMLElement, overrideText?: string) => {
      const tooltipText = overrideText ?? target.getAttribute("data-tooltip");
      if (!tooltipText) return;

      setText(tooltipText);
      setVisible(true);

      // Force a synchronous layout calculation to position it correctly
      requestAnimationFrame(() => {
        if (!ref.current) return;
        const rect = target.getBoundingClientRect();
        const tooltipRect = ref.current.getBoundingClientRect();

        let targetLeft = rect.left;
        let targetWidth = rect.width;

        try {
          // If the target has text content, center tooltip over the text glyph bounds
          if (target.textContent && target.textContent.trim().length > 0) {
            const range = document.createRange();
            range.selectNodeContents(target);
            const rangeRect = range.getBoundingClientRect();
            if (rangeRect.width > 0 && rangeRect.width <= rect.width) {
              targetLeft = rangeRect.left;
              targetWidth = rangeRect.width;
            }
          }
        } catch {
          // fallback to target rect
        }

        let left = targetLeft + (targetWidth - tooltipRect.width) / 2;
        let top = rect.top - tooltipRect.height - 6;

        // Viewport safety margins
        if (left < 6) left = 6;
        if (left + tooltipRect.width > window.innerWidth - 6) {
          left = window.innerWidth - tooltipRect.width - 6;
        }
        if (top < 6) {
          top = rect.bottom + 6; // Show below if no room above
        }

        setPosition({ left, top });
      });
    };

    const hideTooltip = () => {
      setVisible(false);
      activeTarget = null;
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-tooltip]") as HTMLElement;
      if (!target) {
        if (activeTarget) {
          hideTooltip();
        }
        return;
      }

      if (target === activeTarget) return;

      if (activeTarget) {
        hideTooltip();
      }

      activeTarget = target;
      showTooltip(target);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-tooltip]") as HTMLElement;
      if (target && target === activeTarget) {
        const related = e.relatedTarget as HTMLElement;
        if (!related || !target.contains(related)) {
          hideTooltip();
        }
      }
    };

    const handleMouseDown = () => {
      hideTooltip();
    };

    const handleShowCustomTooltip = (e: Event) => {
      const customEvent = e as CustomEvent<{ target?: HTMLElement; text?: string }>;
      if (customEvent.detail?.target) {
        activeTarget = customEvent.detail.target;
        showTooltip(customEvent.detail.target, customEvent.detail.text);
      }
    };

    document.body.addEventListener("mouseover", handleMouseOver);
    document.body.addEventListener("mouseout", handleMouseOut);
    document.body.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("show-tooltip", handleShowCustomTooltip);

    return () => {
      document.body.removeEventListener("mouseover", handleMouseOver);
      document.body.removeEventListener("mouseout", handleMouseOut);
      document.body.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("show-tooltip", handleShowCustomTooltip);
    };
  }, []);

  if (!text) return null;

  return (
    <div
      ref={ref}
      className="app-tooltip"
      style={{
        left: position ? `${position.left}px` : "0px",
        top: position ? `${position.top}px` : "0px",
        opacity: visible && position ? 1 : 0,
        visibility: visible && position ? "visible" : "hidden",
      }}
    >
      {text}
    </div>
  );
};
