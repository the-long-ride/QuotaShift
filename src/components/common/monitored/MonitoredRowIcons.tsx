import React from "react";

export const MonitoredDragHandleIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
    <circle cx="5.5" cy="4" r="1.2" />
    <circle cx="10.5" cy="4" r="1.2" />
    <circle cx="5.5" cy="8" r="1.2" />
    <circle cx="10.5" cy="8" r="1.2" />
    <circle cx="5.5" cy="12" r="1.2" />
    <circle cx="10.5" cy="12" r="1.2" />
  </svg>
);

export const MonitoredUntrackItemIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const MonitoredSortArrowIcon: React.FC<{ direction: "asc" | "desc" }> = ({ direction }) => (
  <svg
    viewBox="0 0 16 16"
    width="10"
    height="10"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.1"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {direction === "asc" ? (
      <>
        <path d="M8 13V3" />
        <path d="M4.5 6.5 8 3l3.5 3.5" />
      </>
    ) : (
      <>
        <path d="M8 3v10" />
        <path d="M4.5 9.5 8 13l3.5-3.5" />
      </>
    )}
  </svg>
);
