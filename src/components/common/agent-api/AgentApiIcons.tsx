import React from "react";

/** Connected nodes and a secure local endpoint (not a quota percentage). */
export const AgentApiIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="8" y="8" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 3v5M12 16v5M3 12h5M16 12h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="12" cy="3" r="1.7" fill="currentColor" />
    <circle cx="12" cy="21" r="1.7" fill="currentColor" />
    <circle cx="3" cy="12" r="1.7" fill="currentColor" />
    <circle cx="21" cy="12" r="1.7" fill="currentColor" />
  </svg>
);

export const AgentApiConfigureIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7 7h10M7 12h7M7 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="m15 9 3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
