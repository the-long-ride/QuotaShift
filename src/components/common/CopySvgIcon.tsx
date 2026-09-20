import React from "react";

export const CopySvgIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    aria-hidden="true"
  >
    <rect
      x="4"
      y="8"
      width="12"
      height="12"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8 6V5C8 4.44772 8.44772 4 9 4H19C19.5523 4 20 4.44772 20 5V15C20 15.5523 19.5523 16 19 16H18"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="2 2"
    />
  </svg>
);

export const CopyLinkSvgIcon: React.FC<{ size?: number }> = ({ size = 11 }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    aria-hidden="true"
  >
    <path
      d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V8a2 2 0 00-2-2h-4M8 4a2 2 0 012-2h3m-5 4H5a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2v-2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
