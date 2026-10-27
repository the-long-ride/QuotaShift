import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ClaudeProfileDTO } from "../../../hooks/claude/gateway/useClaudeCodePoolConnector";
import {
  connectionStateSuffix,
  useClaudeGatewayConnections,
} from "../../../hooks/claude/gateway/useClaudeGatewayConnections";
import { ClaudeProfileDetailDialog } from "../profiles/ClaudeProfileDetailDialog";

export interface ClaudeGatewayConnectionsProps {
  isOpen: boolean;
  profiles: ClaudeProfileDTO[];
  executablePath?: string | null;
}

/** Existing QuotaShift connections, recovered from the backend, each with a Disconnect. */
export const ClaudeGatewayConnections: React.FC<ClaudeGatewayConnectionsProps> = ({
  isOpen,
  profiles,
  executablePath,
}) => {
  const { connections, busyId, error, disconnect, dismiss } = useClaudeGatewayConnections(isOpen);
  const [selectedDetailProfile, setSelectedDetailProfile] = useState<ClaudeProfileDTO | null>(null);

  if (connections.length === 0 && !error) return null;
  const nameOf = (id: string) =>
    id ? (profiles.find((profile) => profile.id === id)?.name ?? id) : "Unknown profile";

  const handleDisconnect = async (bindingId: string, profileName: string) => {
    await disconnect(bindingId);
    try {
      await invoke("delete_claude_profile", { profileName });
    } catch {
      // Ignored if non-managed or already removed
    }
  };

  return (
    <section className="claude-wizard-section" aria-label="Existing Claude Code connections">
      <div className="claude-wizard-section-heading">Connected profiles</div>
      <div className="claude-connected-cards-list">
        {connections.map((connection) => {
          const profileName = nameOf(connection.profileId);
          const profile = profiles.find((p) => p.id === connection.profileId) ?? {
            id: connection.profileId,
            name: profileName,
            configDir: "",
            hasSubscriptionCredentials: false,
            isGatewayOnly: true,
          };

          return (
            <div key={connection.bindingId} className="claude-connected-card">
              <div className="claude-connected-card-header">
                <div className="claude-connected-card-info">
                  <span className="claude-connected-card-title">{profileName}</span>
                  <span className="claude-connected-card-mode">
                    ({connection.mode === "launch-once" ? "launch once" : "persistent"}
                    {connectionStateSuffix(connection)})
                  </span>
                </div>
                <div className="claude-connected-card-actions">
                  <button
                    type="button"
                    className="dialog-btn dialog-btn--secondary claude-card-action-btn"
                    data-tooltip="View profile details, binary path, and edit settings.json"
                    onClick={() => setSelectedDetailProfile(profile)}
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    className="dialog-btn dialog-btn--secondary claude-card-action-btn"
                    data-tooltip="Revoke this connection and undo the settings QuotaShift wrote"
                    disabled={busyId === connection.bindingId}
                    onClick={() => void handleDisconnect(connection.bindingId, profileName)}
                  >
                    {busyId === connection.bindingId
                      ? "Disconnecting..."
                      : connection.cleanupPending
                        ? "Clean up"
                        : "Disconnect"}
                  </button>
                  {connection.cleanupPending && (
                    <button
                      type="button"
                      className="dialog-btn dialog-btn--secondary claude-card-action-btn"
                      data-tooltip="QuotaShift stops tracking this and leaves your settings.json as it is. Remove apiKeyHelper and ANTHROPIC_BASE_URL yourself if you no longer want them."
                      disabled={busyId === connection.bindingId}
                      onClick={() => void dismiss(connection.bindingId)}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {connections.some((connection) => connection.cleanupPending) && (
        <p className="form-hint">
          Dismiss makes QuotaShift stop tracking a leftover connection and leaves your settings.json
          as it is. Remove apiKeyHelper and ANTHROPIC_BASE_URL from it yourself if you no longer
          want them.
        </p>
      )}
      {error && (
        <div role="alert" className="codex-model-validation codex-model-validation--error">
          {error}
        </div>
      )}

      {selectedDetailProfile && (
        <ClaudeProfileDetailDialog
          isOpen={Boolean(selectedDetailProfile)}
          profile={selectedDetailProfile}
          executablePath={executablePath}
          onClose={() => setSelectedDetailProfile(null)}
          onDisconnectAndRemove={async () => {
            const conn = connections.find((c) => c.profileId === selectedDetailProfile.id);
            if (conn) {
              await handleDisconnect(conn.bindingId, selectedDetailProfile.name);
            } else {
              await invoke("delete_claude_profile", { profileName: selectedDetailProfile.name });
            }
          }}
        />
      )}
    </section>
  );
};
