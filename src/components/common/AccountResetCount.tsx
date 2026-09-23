import React from "react";
import { formatResetCount } from "../../utils/common/format-reset-count";

interface AccountResetCountProps {
  count: number | null | undefined;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const AccountResetCount: React.FC<AccountResetCountProps> = ({ count, onClick }) => {
  if (count == null) return null;

  const label = formatResetCount(count);
  if (count <= 0 || !onClick) {
    return <span className="account-reset-count">{label}</span>;
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
