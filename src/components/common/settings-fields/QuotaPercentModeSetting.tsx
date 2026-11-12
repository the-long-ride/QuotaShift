import React from "react";
import { useQuotaPercentMode } from "../../../hooks/desktop/useQuotaPercentMode";
import { saveQuotaPercentMode } from "../../../utils/common/settings/quota-percent-mode";

const QuotaUsageIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
    <path d="M3 7C3 4.79086 4.79086 3 7 3H17C19.2091 3 21 4.79086 21 7V17C21 19.2091 19.2091 21 17 21H7C4.79086 21 3 19.2091 3 17V7Z"
      stroke="currentColor" strokeWidth="2" />
    <path d="M15 9L9 15" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="14.5" cy="14.5" r="1.5" fill="currentColor" />
    <circle cx="9.5" cy="9.5" r="1.5" fill="currentColor" />
  </svg>
);

export const QuotaPercentModeSetting: React.FC = () => {
  const showUsed = useQuotaPercentMode();
  return (
    <div className="settings-toggle-row settings-toggle-row--segmented">
      <span className="settings-row-icon"><QuotaUsageIcon /></span>
      <span className="settings-toggle-copy">
        <span className="settings-toggle-label">How to show quota usage</span>
        <span className="settings-toggle-description">
          Applies to account cards, the overlay and taskbar; quota warnings still use remaining.
        </span>
      </span>
      <div className="settings-segmented-switch" role="group" aria-label="Quota usage display" data-segments="2" data-active-index={showUsed ? 1 : 0}>
        <button type="button"
          className={`settings-segment-btn ${!showUsed ? "settings-segment-btn--active" : ""}`}
          aria-pressed={!showUsed}
          data-tooltip="Show quota remaining everywhere"
          onClick={() => saveQuotaPercentMode(false)}>
          Remaining
        </button>
        <button type="button"
          className={`settings-segment-btn ${showUsed ? "settings-segment-btn--active" : ""}`}
          aria-pressed={showUsed}
          data-tooltip="Show quota used everywhere"
          onClick={() => saveQuotaPercentMode(true)}>
          Used
        </button>
      </div>
    </div>
  );
};
