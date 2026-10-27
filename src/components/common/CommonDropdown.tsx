import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import "../../styles/common/common-dropdown.css";

export interface CommonDropdownOption<T extends string = string> {
  value: T;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

export interface CommonDropdownProps<T extends string = string> {
  id?: string;
  value: T;
  options: CommonDropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  tooltip?: string;
  ariaLabel?: string;
  width?: string | number;
}

const DropdownChevronIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden="true">
    <path d="M4.2 6.2a.75.75 0 0 1 1.06 0L8 8.94l2.74-2.74a.75.75 0 1 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L4.2 7.26a.75.75 0 0 1 0-1.06z" />
  </svg>
);

const DropdownCheckIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true">
    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
  </svg>
);

export function CommonDropdown<T extends string = string>({
  id,
  value,
  options,
  onChange,
  placeholder = "Select...",
  disabled = false,
  className = "",
  tooltip,
  ariaLabel,
  width,
}: CommonDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties | null>(null);
  const menuId = useId();

  const selectedOption = options.find((opt) => opt.value === value);
  const updateMenuPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Match the rendered trigger's border-box width, unless the viewport is narrower.
    const width = Math.min(rect.width, Math.max(0, window.innerWidth - 16));
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const estimatedHeight = Math.min(202, Math.max(48, options.length * 28 + 8));
    const availableBelow = window.innerHeight - rect.bottom - 8;
    const availableAbove = rect.top - 8;
    const opensAbove =
      availableBelow < Math.min(estimatedHeight, 100) && availableAbove > availableBelow;
    const maxHeight = Math.max(40, Math.min(200, opensAbove ? availableAbove : availableBelow));
    const top = opensAbove
      ? Math.max(8, rect.top - Math.min(estimatedHeight, maxHeight) - 4)
      : rect.bottom + 4;
    setMenuPosition({
      position: "fixed",
      top,
      left,
      width,
      maxHeight,
      "--common-dropdown-option-height": `${rect.height}px`,
    } as React.CSSProperties);
  }, [options.length]);

  useLayoutEffect(() => {
    if (isOpen) updateMenuPosition();
    else setMenuPosition(null);
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        const currentIndex = options.findIndex((opt) => opt.value === value);
        setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
      } else {
        const delta = e.key === "ArrowDown" ? 1 : -1;
        setHighlightedIndex((prev) => {
          const next = prev + delta;
          if (next < 0) return options.length - 1;
          if (next >= options.length) return 0;
          return next;
        });
      }
    } else if (e.key === "Enter" || e.key === " ") {
      if (isOpen && highlightedIndex >= 0 && options[highlightedIndex]) {
        e.preventDefault();
        const option = options[highlightedIndex];
        if (!option.disabled) {
          onChange(option.value);
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      } else if (!isOpen) {
        e.preventDefault();
        setIsOpen(true);
      }
    }
  };

  const handleSelectOption = (opt: CommonDropdownOption<T>) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const triggerTooltip = tooltip || (selectedOption ? selectedOption.label : placeholder);

  return (
    <div
      className={`common-dropdown-wrap ${className}`.trim()}
      ref={rootRef}
      style={width ? { width } : undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={`common-dropdown-trigger ${isOpen ? "common-dropdown-trigger--open" : ""}`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={ariaLabel || tooltip || "Select option"}
        data-tooltip={triggerTooltip}
      >
        <span className="common-dropdown-selected-label">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span
          className={`common-dropdown-arrow ${isOpen ? "common-dropdown-arrow--open" : ""}`}
          aria-hidden="true"
        >
          <DropdownChevronIcon />
        </span>
      </button>

      {isOpen &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            style={menuPosition}
            id={menuId}
            className="common-dropdown-menu"
            role="listbox"
            aria-label={ariaLabel || tooltip || "Options"}
            tabIndex={-1}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === highlightedIndex;
              const itemTooltip = opt.sublabel ? `${opt.label} ${opt.sublabel}` : opt.label;

              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  className={`common-dropdown-item ${isSelected ? "common-dropdown-item--selected" : ""} ${isHighlighted ? "common-dropdown-item--highlighted" : ""}`}
                  onClick={() => handleSelectOption(opt)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  data-tooltip={itemTooltip}
                >
                  <span className="common-dropdown-item-label">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="common-dropdown-item-sublabel">{opt.sublabel}</span>
                  )}
                  {isSelected && (
                    <span className="common-dropdown-item-check" aria-hidden="true">
                      <DropdownCheckIcon />
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

export const CommonSelect = CommonDropdown;
