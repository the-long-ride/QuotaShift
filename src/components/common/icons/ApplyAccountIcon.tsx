import React from "react";

export const ApplyAccountIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg
    viewBox="0 -3 32 32"
    width={size}
    height={size}
    fill="none"
    aria-hidden="true"
    className="apply-account-icon"
  >
    <g transform="translate(-518 -1039)" fill="currentColor">
      <path d="M548.783 1040.2C547.188 1038.57 544.603 1038.57 543.008 1040.2L528.569 1054.92L524.96 1051.24C523.365 1049.62 520.779 1049.62 519.185 1051.24C517.59 1052.87 517.59 1055.51 519.185 1057.13L525.682 1063.76C527.277 1065.39 529.862 1065.39 531.457 1063.76L548.783 1046.09C550.378 1044.46 550.378 1041.82 548.783 1040.2Z" />
    </g>
  </svg>
);
