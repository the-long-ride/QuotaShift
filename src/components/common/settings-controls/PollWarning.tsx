import React from "react";
import type { WarningLevel } from "../settings/settings-helpers";

export const PollWarning: React.FC<{
  warning: WarningLevel;
  type: "tracked" | "idle";
}> = ({ warning, type }) => {
  if (!warning) return null;
  const message =
    type === "tracked"
      ? warning === "low"
        ? "Value below recommendation — frequent polling may affect performance and rate limits."
        : "Value above recommendation — quota changes may take longer to detect."
      : warning === "low"
        ? "Value below recommendation — frequent idle polling may affect performance."
        : "Value above recommendation — idle-account changes may take longer to detect.";

  return <div className={`settings-warning settings-warning--${warning}`}>{message}</div>;
};
