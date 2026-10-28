import React from "react";

const CHECKED_PATH =
  "m24 24h-24v-24h18.4v2.4h-16v19.2h20v-8.8h2.4v11.2zm-19.52-12.42 1.807-1.807 5.422 5.422 13.68-13.68 1.811 1.803-15.491 15.491z";
const UNCHECKED_PATH = "m24 24h-24v-24h24.8v24zm-1.6-2.4v-19.2h-20v19.2z";

export const CodexPoolMemberCheckbox: React.FC<{
  selected: boolean;
  label: string;
  onToggle: () => void;
}> = ({ selected, label, onToggle }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={selected}
    aria-label={`${selected ? "Remove" : "Add"} ${label}`}
    data-tooltip={`${selected ? "Remove" : "Add"} ${label}`}
    className={`codex-pool-member-checkbox${selected ? " codex-pool-member-checkbox--checked" : ""}`}
    onClick={onToggle}
  >
    <svg viewBox="0 0 27 24" aria-hidden="true">
      <path d={selected ? CHECKED_PATH : UNCHECKED_PATH} />
    </svg>
  </button>
);

export const CodexPoolMemberIdentity: React.FC<{ label: string; email?: string | null }> = ({
  label,
  email,
}) => (
  <div className="codex-pool-member-identity">
    <span className="codex-pool-member-label">{label}</span>
    <span className="codex-pool-member-email">{email ?? "No email"}</span>
  </div>
);
