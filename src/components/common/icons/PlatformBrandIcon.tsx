import React from "react";
import { ClaudeLogo } from "../../claude/ClaudeLogo";
import { OpenAILogo } from "./ModelLogos";
import type { PlatformId } from "../../../utils/common/ui/platform-visibility";

export const PlatformBrandIcon: React.FC<{ platform: PlatformId }> = ({ platform }) => {
  if (platform === "antigravity") {
    return (
      <>
        <img
          className="tab-brand-icon tab-brand-icon--ag-dark"
          src="https://antigravity.google/assets/image/brand/antigravity-icon__white.png"
          alt=""
          aria-hidden="true"
        />
        <img
          className="tab-brand-icon tab-brand-icon--ag-light"
          src="https://antigravity.google/assets/image/brand/antigravity-icon__one-color.png"
          alt=""
          aria-hidden="true"
        />
      </>
    );
  }
  if (platform === "codex") {
    return <OpenAILogo size={12} className="tab-brand-icon tab-brand-icon--codex" />;
  }
  return <ClaudeLogo size={12} className="tab-brand-icon" />;
};
