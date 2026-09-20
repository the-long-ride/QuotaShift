import React from "react";
import { classifyAntigravityTier } from "../../utils/antigravity/antigravity-tier-summary";

export const AntigravityCardPlan: React.FC<{ plan: string }> = ({ plan }) => (
  <span className="account-card-plan-badge">{classifyAntigravityTier(plan)}</span>
);
