import React from "react";
import { CompactRefreshIcon } from "../common/CompactRefreshIcon";

export const CodexRefreshIcon: React.FC = () => <CompactRefreshIcon />;

export const CodexModelsIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
    <path
      d="M4 5.5h16M4 12h16M4 18.5h10"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <circle cx="18" cy="18.5" r="2" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const CodexAddIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" width="10" height="10">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const CodexBestIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" width="10" height="10">
    <path
      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);
