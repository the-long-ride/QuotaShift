import React from "react";

interface OverlayNavArrowProps {
  direction: "up" | "down";
  onClick: () => void;
  title?: string;
  disabled?: boolean;
}

export const OverlayNavArrow: React.FC<OverlayNavArrowProps> = ({
  direction,
  onClick,
  title,
  disabled,
}) => {
  const defaultTitle = direction === "up" ? "Previous accounts" : "More accounts";
  return (
    <button
      type="button"
      className={`overlay-nav-arrow overlay-nav-arrow--${direction}${disabled ? " overlay-nav-arrow--disabled" : ""}`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onClick();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      data-tooltip={title ?? defaultTitle}
      aria-label={title ?? defaultTitle}
    >
      <svg
        viewBox="0 0 511.89 511.89"
        className="overlay-nav-arrow-icon"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="12.285"
        aria-hidden="true"
      >
        <path d="M476.84,248.107L233.64,3.2c-2.027-2.027-4.693-3.2-7.573-3.2H42.6c-5.867,0-10.667,4.8-10.667,10.667 c0,2.88,1.173,5.547,3.093,7.573l237.76,237.44L35.24,493.76c-4.16,4.16-4.16,10.88,0,15.04c2.027,2.027,4.693,3.093,7.573,3.093 H226.28c2.88,0,5.547-1.173,7.573-3.2L476.84,263.04C481,258.987,481,252.267,476.84,248.107z M221.8,490.667H68.52 l226.987-227.52c4.16-4.16,4.16-10.88,0-15.04L68.413,21.333h153.28l232.64,234.347L221.8,490.667z" />
      </svg>
    </button>
  );
};
