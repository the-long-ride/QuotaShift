import React from "react";

interface MonitoredAccountsIconProps {
  size?: number;
  strokeWidth?: number;
}

export const MonitoredAccountsIcon: React.FC<MonitoredAccountsIconProps> = ({
  size = 14,
  strokeWidth = 1.75,
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 5v14" />
    <path d="M3.5 7.5L6 5l2.5 2.5" />
    <path d="M3.5 16.5L6 19l2.5-2.5" />
    <line x1="11" y1="7" x2="21" y2="7" />
    <line x1="11" y1="12" x2="21" y2="12" />
    <line x1="11" y1="17" x2="21" y2="17" />
  </svg>
);
