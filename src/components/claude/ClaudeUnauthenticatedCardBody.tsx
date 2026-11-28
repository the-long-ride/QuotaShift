import React, { useState } from "react";
import type { ClaudeAccount } from "../../utils/common/types";

interface ClaudeUnauthenticatedCardBodyProps {
  account: ClaudeAccount;
  onOpenConfigPath: (event: React.SyntheticEvent<HTMLElement>) => void | Promise<void>;
}

export const ClaudeUnauthenticatedCardBody: React.FC<ClaudeUnauthenticatedCardBodyProps> = ({
  account,
  onOpenConfigPath,
}) => {
  const [copiedLauncher, setCopiedLauncher] = useState(false);

  const handleCopyLauncher = async (event: React.SyntheticEvent<HTMLElement>) => {
    event.stopPropagation();
    if (!account.launcherCommand) return;
    try {
      await navigator.clipboard.writeText(account.launcherCommand);
      setCopiedLauncher(true);
      window.setTimeout(() => setCopiedLauncher(false), 1200);
    } catch {}
  };

  return (
    <>
      <div className="account-card-email-tier-row">
        <span className="account-card-plan-badge claude-card-unauth-badge">Not signed in</span>
        {account.launcherCommand && (
          <>
            <span className="claude-card-meta-separator" aria-hidden="true">
              -
            </span>
            <button
              type="button"
              className="claude-card-launcher-cmd"
              onClick={(event) => void handleCopyLauncher(event)}
              onDoubleClick={(event) => event.stopPropagation()}
              data-tooltip={copiedLauncher ? "Copied" : "Click to copy launcher command"}
            >
              {account.launcherCommand}
            </button>
          </>
        )}
      </div>
      <button
        type="button"
        className="claude-account-path"
        onClick={(event) => void onOpenConfigPath(event)}
        data-tooltip="Open Claude Code config folder"
      >
        {account.configDir}
      </button>
      <div className="claude-card-unauth-hint">
        {account.launcherCommand
          ? `Run ${account.launcherCommand} in terminal to sign in`
          : "Sign in with this profile to track quota"}
      </div>
    </>
  );
};
