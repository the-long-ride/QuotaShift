import React from "react";

const LABEL = "Apply this account";

export interface OverlayMenuApplyItemProps {
  onClick: (e: React.MouseEvent) => void;
  showTooltip: (text: string, event: React.SyntheticEvent<HTMLButtonElement>) => void;
  hideTooltip: () => void;
}

/** Context-menu item that applies the targeted account to its local application. */
export const OverlayMenuApplyItem: React.FC<OverlayMenuApplyItemProps> = ({
  onClick,
  showTooltip,
  hideTooltip,
}) => (
  <button
    type="button"
    className="overlay-menu-item"
    onClick={onClick}
    data-tooltip={LABEL}
    aria-label={LABEL}
    onMouseEnter={(event) => showTooltip(LABEL, event)}
    onMouseLeave={hideTooltip}
    onFocus={(event) => showTooltip(LABEL, event)}
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
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="16 11 18 13 22 9" />
    </svg>
  </button>
);
