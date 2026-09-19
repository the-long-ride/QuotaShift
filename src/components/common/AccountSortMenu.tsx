import React, { useEffect, useRef, useState } from "react";
import type { AccountSortDirection, AccountSortField } from "../../utils/account/account-sort";

const SORT_FIELDS: Array<{ field: AccountSortField; label: string }> = [
  { field: "alias", label: "Alias name" },
  { field: "email", label: "Email" },
  { field: "tier", label: "Tier" },
  { field: "usage", label: "Usage" },
  { field: "lastUsed", label: "Last used" },
];

const SortIcon: React.FC = () => (
  <svg viewBox="0 0 1024 1024" aria-hidden="true">
    <path
      fill="currentColor"
      d="M384 96a32 32 0 0 1 64 0v786.752a32 32 0 0 1-54.592 22.656L95.936 608a32 32 0 0 1 0-45.312h.128a32 32 0 0 1 45.184 0L384 805.632V96zm192 45.248a32 32 0 0 1 54.592-22.592L928.064 416a32 32 0 0 1 0 45.312h-.128a32 32 0 0 1-45.184 0L640 218.496V928a32 32 0 1 1-64 0V141.248z"
    />
  </svg>
);

export const AccountSortMenu: React.FC<{
  disabled?: boolean;
  onSort: (field: AccountSortField, direction: AccountSortDirection) => void;
}> = ({ disabled = false, onSort }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const applySort = (field: AccountSortField, direction: AccountSortDirection) => {
    onSort(field, direction);
    setOpen(false);
  };

  return (
    <div className="account-sort-menu-wrap" ref={rootRef}>
      <button
        type="button"
        className="account-action-btn account-action-btn--icon-only account-sort-trigger"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-label="Sort accounts"
        aria-haspopup="menu"
        aria-expanded={open}
        data-tooltip="Sort accounts"
      >
        <SortIcon />
      </button>
      {open && (
        <div className="account-sort-menu" role="menu" aria-label="Sort accounts">
          {SORT_FIELDS.map(({ field, label }) => (
            <div className="account-sort-menu-row" key={field}>
              <span className="account-sort-menu-label">{label}</span>
              <button
                type="button"
                className="account-sort-direction-btn"
                role="menuitem"
                onClick={() => applySort(field, "asc")}
                data-tooltip={`Sort ${label} ascending`}
              >
                Asc
              </button>
              <button
                type="button"
                className="account-sort-direction-btn"
                role="menuitem"
                onClick={() => applySort(field, "desc")}
                data-tooltip={`Sort ${label} descending`}
              >
                Desc
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
