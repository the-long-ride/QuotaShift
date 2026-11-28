import React from "react";
import {
  formatResetCount,
  formatRetryAfterTime,
} from "../../../utils/common/ui/format-reset-count";

interface AccountResetCountProps {
  count: number | null | undefined;
  stale?: boolean;
  retryAfterAt?: number | null;
  tooltip?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const AccountResetCount: React.FC<AccountResetCountProps> = ({
  count,
  stale = false,
  retryAfterAt,
  tooltip,
  onClick,
}) => {
  // Nothing to show (or click) without an available reset.
  if (count == null || count <= 0) return null;

  const label = formatResetCount(count);
  const retryTime = formatRetryAfterTime(retryAfterAt);
  const customTooltip =
    tooltip ??
    (stale
      ? retryTime
        ? `Cached reset count (rate limited · retries after ${retryTime})\nClick to see detail`
        : "Cached reset count (refresh rate limited)\nClick to see detail"
      : null);
  const staleClass = stale ? " account-reset-count--stale" : "";

  if (!onClick) {
    return (
      <span
        className={`account-reset-count${staleClass}`}
        data-tooltip={customTooltip ?? undefined}
      >
        {label}
      </span>
    );
  }

  if (customTooltip) {
    return (
      <button
        type="button"
        className={`account-reset-count account-reset-count--link${staleClass}`}
        onClick={(event) => {
          event.stopPropagation();
          onClick(event);
        }}
        data-tooltip={customTooltip}
        aria-label={`View details for ${label}`}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="account-reset-count account-reset-count--link"
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      data-tooltip="Click to see detail"
      aria-label={`View details for ${label}`}
    >
      {label}
    </button>
  );
};
