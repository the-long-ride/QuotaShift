import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Backend-recovered connection. Never carries a secret. */
export interface ClaudeGatewayConnection {
  profileId: string;
  bindingId: string;
  mode: "launch-once" | "persistent-profile";
  connected: boolean;
  /** No live binding, but a settings patch is still recorded and must be undone. */
  cleanupPending: boolean;
  /** settings.json points at an older router address. Reconnect to rewrite it. */
  gatewayMoved: boolean;
}

/** The suffix shown after the mode in the Connected profiles list. */
export function connectionStateSuffix(
  connection: Pick<ClaudeGatewayConnection, "cleanupPending" | "gatewayMoved" | "connected">,
): string {
  if (connection.cleanupPending) return ", cleanup pending";
  if (connection.gatewayMoved) return ", router address changed - reconnect";
  return connection.connected ? "" : ", router stopped";
}

export const DISCONNECT_RETRY_HINT =
  "Disconnect did not finish. QuotaShift kept this connection so you can retry.";

/** A settings conflict means the binding is already revoked, so no retry is useful. */
export function isSettingsConflict(message: string): boolean {
  return /conflict/i.test(message);
}

export function useClaudeGatewayConnections(active: boolean) {
  const [connections, setConnections] = useState<ClaudeGatewayConnection[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConnections(await invoke<ClaudeGatewayConnection[]>("list_claude_gateway_connections"));
    } catch (failure) {
      setError(`Unable to list Claude Code connections: ${String(failure)}`);
    }
  }, []);

  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  const disconnect = useCallback(
    async (bindingId: string) => {
      setBusyId(bindingId);
      setError(null);
      try {
        await invoke("disconnect_claude_code", { bindingId });
      } catch (failure) {
        const message = String(failure);
        setError(isSettingsConflict(message) ? message : `${DISCONNECT_RETRY_HINT} ${message}`);
      } finally {
        setBusyId(null);
        await refresh();
      }
    },
    [refresh],
  );

  const dismiss = useCallback(
    async (journalId: string) => {
      setBusyId(journalId);
      setError(null);
      try {
        await invoke("dismiss_claude_gateway_cleanup", { journalId });
      } catch (failure) {
        setError(String(failure));
      } finally {
        setBusyId(null);
        await refresh();
      }
    },
    [refresh],
  );

  return { connections, busyId, error, refresh, disconnect, dismiss };
}
