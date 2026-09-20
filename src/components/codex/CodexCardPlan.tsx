import React from "react";
export const CodexCardPlan: React.FC<{ planText: string }> = ({ planText }) => (
  <span className="account-card-plan-badge">{planText}</span>
);
