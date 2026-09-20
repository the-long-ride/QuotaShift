import React, { useEffect, useRef, useState } from "react";
import { shortcutKeycaps } from "../../utils/common/shortcuts";

export const Tooltip: React.FC = () => {
  const [text, setText] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState<string | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [visible, setVisible] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let activeTarget: HTMLElement | null = null;
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;

    const showTooltip = (target: HTMLElement, overrideText?: string) => {
      const tooltipText = overrideText ?? target.getAttribute("data-tooltip");
      if (!tooltipText) return;

      setText(tooltipText);
      setShortcut(overrideText ? null : target.getAttribute("data-shortcut"));
      setVisible(true);

      requestAnimationFrame(() => {
        if (!ref.current) return;
        const rect = target.getBoundingClientRect();
        const tooltipRect = ref.current.getBoundingClientRect();

        let targetLeft = rect.left;
        let targetWidth = rect.width;

        try {
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
          // Fall back to the target bounds.
        }

        let left = targetLeft + (targetWidth - tooltipRect.width) / 2;
        let top = rect.top - tooltipRect.height - 6;

        if (left < 6) left = 6;
        if (left + tooltipRect.width > window.innerWidth - 6) {
          left = window.innerWidth - tooltipRect.width - 6;
        }
        if (top < 6) top = rect.bottom + 6;

        setPosition({ left, top });
      });
    };

    const hideTooltip = () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      setVisible(false);
      activeTarget = null;
    };

    const handleMouseOver = (event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest("[data-tooltip]") as HTMLElement;
      if (!target) {
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        if (activeTarget) hideTooltip();
        return;
      }

      if (target === activeTarget) return;
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      if (activeTarget) hideTooltip();

      activeTarget = target;
      hoverTimer = setTimeout(() => {
        if (activeTarget === target) showTooltip(target);
        hoverTimer = null;
      }, 500);
    };

    const handleMouseOut = (event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest("[data-tooltip]") as HTMLElement;
      if (target && target === activeTarget) {
        const related = event.relatedTarget as HTMLElement;
        if (!related || !target.contains(related)) hideTooltip();
      }
    };

    const handleMouseDown = () => hideTooltip();

    const handleShowCustomTooltip = (event: Event) => {
      const customEvent = event as CustomEvent<{ target?: HTMLElement; text?: string }>;
      if (customEvent.detail?.target) {
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        activeTarget = customEvent.detail.target;
        showTooltip(customEvent.detail.target, customEvent.detail.text);
      }
    };

    document.body.addEventListener("mouseover", handleMouseOver);
    document.body.addEventListener("mouseout", handleMouseOut);
    document.body.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("show-tooltip", handleShowCustomTooltip);

    return () => {
      if (hoverTimer) clearTimeout(hoverTimer);
      document.body.removeEventListener("mouseover", handleMouseOver);
      document.body.removeEventListener("mouseout", handleMouseOut);
      document.body.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("show-tooltip", handleShowCustomTooltip);
    };
  }, []);

  if (!text) return null;

  const keys = shortcut ? shortcutKeycaps(shortcut) : [];

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
      <span className="app-tooltip-text">{text}</span>
      {keys.length > 0 && (
        <span className="app-tooltip-shortcut" aria-label={keys.join(" + ")}>
          {keys.map((key, index) => (
            <React.Fragment key={`${key}-${index}`}>
              {index > 0 && <span className="app-tooltip-key-separator">+</span>}
              <kbd className="app-tooltip-keycap">{key}</kbd>
            </React.Fragment>
          ))}
        </span>
      )}
    </div>
  );
};
