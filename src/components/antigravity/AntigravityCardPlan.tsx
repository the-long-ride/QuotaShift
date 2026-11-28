import React from "react";
import { classifyAntigravityTier } from "../../utils/antigravity/quota/antigravity-tier-summary";
import { buildAntigravityTierTooltip } from "../../utils/antigravity/quota/antigravity-tier-tooltip";
import { tierBadgeSlug } from "../../utils/common/accounts/tier-badge-slug";

export interface AntigravityCardPlanProps {
  plan: string;
  premiumModels?: readonly string[] | null;
}

export const AntigravityCardPlan: React.FC<AntigravityCardPlanProps> = ({
  plan,
  premiumModels,
}) => {
  const tier = classifyAntigravityTier(plan);
  const tooltip = buildAntigravityTierTooltip(tier, premiumModels);
  return (
    <span
      className="account-card-plan-badge"
      data-tier={tierBadgeSlug(tier)}
      data-tooltip={tooltip}
    >
      {tier}
    </span>
  );
};
