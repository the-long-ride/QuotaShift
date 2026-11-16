import React from "react";
import type { CircleOrientation } from "../../utils/common/overlay/circle-layout";

interface OverlayMenuSwapOrientationItemProps {
  orientation: CircleOrientation;
  onClick: (e: React.MouseEvent) => void;
  showTooltip: (text: string, event: React.SyntheticEvent<HTMLButtonElement>) => void;
  hideTooltip: () => void;
}

/** Context-menu button to toggle Circle overlay layout between vertical and horizontal. */
export const OverlayMenuSwapOrientationItem: React.FC<OverlayMenuSwapOrientationItemProps> = ({
  orientation,
  onClick,
  showTooltip,
  hideTooltip,
}) => {
  const label =
    orientation === "vertical" ? "Switch to horizontal layout" : "Switch to vertical layout";
  return (
    <button
      type="button"
      className="overlay-menu-item"
      onClick={onClick}
      data-tooltip={label}
      aria-label={label}
      onMouseEnter={(event) => showTooltip(label, event)}
      onMouseLeave={hideTooltip}
      onFocus={(event) => showTooltip(label, event)}
      onBlur={hideTooltip}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M16 3l4 4-4 4" />
        <path d="M20 7H4" />
        <path d="M8 21l-4-4 4-4" />
        <path d="M4 17h16" />
      </svg>
    </button>
  );
};
