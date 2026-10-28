import React, { useId } from "react";

interface TrackCurrentAccountIconProps {
  size?: number;
  gradient?: boolean;
  className?: string;
}

export const TrackCurrentAccountIcon: React.FC<TrackCurrentAccountIconProps> = ({
  size = 10,
  gradient = false,
  className = "",
}) => {
  const gradientId = useId().replace(/:/g, "");
  const fill = gradient ? `url(#${gradientId})` : "currentColor";

  return (
    <svg
      viewBox="0 0 1024 1024"
      className={`icon track-current-account-icon ${gradient ? "track-current-account-icon--gradient" : ""} ${className}`.trim()}
      xmlns="http://www.w3.org/2000/svg"
      fill={fill}
      width={size}
      height={size}
      aria-hidden="true"
    >
      {gradient && (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#facc15" />
            <stop offset="50%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
      )}
      <path d="M512 896a384 384 0 100-768 384 384 0 000 768zm0 64a448 448 0 110-896 448 448 0 010 896z" />
      <path d="M512 96a32 32 0 0132 32v192a32 32 0 01-64 0V128a32 32 0 0132-32zm0 576a32 32 0 0132 32v192a32 32 0 11-64 0V704a32 32 0 0132-32zM96 512a32 32 0 0132-32h192a32 32 0 010 64H128a32 32 0 01-32-32zm576 0a32 32 0 0132-32h192a32 32 0 110 64H704a32 32 0 01-32-32z" />
    </svg>
  );
};
