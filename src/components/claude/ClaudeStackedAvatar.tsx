import React from "react";
import { ClaudeLogo } from "./ClaudeLogo";

interface ClaudeStackedAvatarProps {
  initial: string;
  logoSize: number;
  bgClassName: string;
  letterClassName: string;
}

/** Claude account avatar layer: background Claude mark with alias initial letter in front. */
export const ClaudeStackedAvatar: React.FC<ClaudeStackedAvatarProps> = ({
  initial,
  logoSize,
  bgClassName,
  letterClassName,
}) => (
  <>
    <ClaudeLogo size={logoSize} className={bgClassName} />
    <span className={letterClassName}>{initial}</span>
  </>
);
