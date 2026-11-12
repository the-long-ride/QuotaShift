import React from "react";
import type { ClaudeResetCredits } from "../../utils/claude/claude-reset-credits";

export const ClaudeResetUnavailableBadge: React.FC<{
  credits: ClaudeResetCredits | undefined;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ credits, onClick }) => {
  if (!credits || (credits.status !== "ineligible" && credits.status !== "unavailable")) {
    return null;
  }
  const reason = credits.reason ?? credits.status;
  const tooltip = reason === "surface" || reason === "cli_version"
    ? "Claude CLI OAuth does not expose saved reset credits for this session. Check Claude Desktop > Settings > Usage."
    : `Claude reset credits are unavailable (${reason}); this does not mean 0 remaining resets.`;
  return (
    <button type="button" className="account-reset-count account-reset-count--link"
      data-tooltip={tooltip} aria-label={tooltip} disabled={!onClick}
      onClick={(event) => { event.stopPropagation(); onClick?.(event); }}>
      RC?
    </button>
  );
};
