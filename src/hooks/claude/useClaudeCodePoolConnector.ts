import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export const DEFAULT_SLOT_HINT = "Map the Default slot: unmapped Claude models use it.";

export interface ClaudeConnectResult {
  bindingId: string;
  mode: string;
  launched: boolean;
  profileSettingsPath?: string | null;
}

export type ConnectionMode = "launch-once" | "persistent-profile";
export type ConnectionStatus = "disconnected" | "connected" | "degraded" | "failed";

export interface ClaudeInstallationDTO {
  path: string;
  canonicalPath: string;
  version?: string;
  provenance: string;
  isWsl: boolean;
  requiresExplicitConfirmation: boolean;
}

export interface ClaudeProfileDTO {
  id: string;
  name: string;
  configDir: string;
  launcherPath?: string | null;
  hasSubscriptionCredentials: boolean;
  isGatewayOnly: boolean;
}

export interface CreatedClaudeProfileDTO extends ClaudeProfileDTO {
  commandName: string;
  launcherPath: string;
  pathAdded: boolean;
  pathWarning?: string | null;
}

export interface ClaudeConnectorState {
  installations: ClaudeInstallationDTO[];
  profiles: ClaudeProfileDTO[];
  selectedInstallation: string | null;
  selectedProfile: string | null;
  connectionMode: ConnectionMode;
  modelMappings: Record<string, string>;
  isConnecting: boolean;
  isCreatingProfile: boolean;
  connectionStatus: ConnectionStatus;
  lastError: string | null;
}

export function useClaudeCodePoolConnector() {
  const [state, setState] = useState<ClaudeConnectorState>({
    installations: [],
    profiles: [],
    selectedInstallation: null,
    selectedProfile: null,
    connectionMode: "launch-once",
    modelMappings: {},
    isConnecting: false,
    isCreatingProfile: false,
    connectionStatus: "disconnected",
    lastError: null,
  });

  const [bindingId, setBindingId] = useState<string | null>(null);

  const setInstallation = useCallback((path: string | null) => {
    setState((prev) => ({ ...prev, selectedInstallation: path }));
  }, []);

  const setProfile = useCallback((profileId: string | null) => {
    setState((prev) => ({ ...prev, selectedProfile: profileId }));
  }, []);

  const setMode = useCallback((mode: ConnectionMode) => {
    setState((prev) => ({ ...prev, connectionMode: mode }));
  }, []);

  const setSlotMapping = useCallback((slot: string, modelAlias: string) => {
    setState((prev) => ({
      ...prev,
      modelMappings: {
        ...prev.modelMappings,
        [slot]: modelAlias,
      },
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void invoke<{
      installations: ClaudeInstallationDTO[];
      profiles: ClaudeProfileDTO[];
    }>("get_claude_connect_targets")
      .then((targets) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            installations: targets.installations,
            profiles: targets.profiles,
          }));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            lastError: `Unable to inventory installed Claude Code profiles: ${String(error)}`,
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createProfile = useCallback(
    async (
      profileName: string,
      template: "default" | "copy-settings",
      sourceProfileId?: string,
    ) => {
      setState((prev) => ({ ...prev, isCreatingProfile: true, lastError: null }));
      try {
        const created = await invoke<CreatedClaudeProfileDTO>("create_managed_claude_profile", {
          profileName,
          template,
          sourceProfileId: template === "copy-settings" ? sourceProfileId : null,
        });
        const inventory = await invoke<{
          installations: ClaudeInstallationDTO[];
          profiles: ClaudeProfileDTO[];
        }>("get_claude_connect_targets");
        setState((prev) => ({
          ...prev,
          installations: inventory.installations,
          profiles: inventory.profiles.some((profile) => profile.id === created.id)
            ? inventory.profiles
            : [...inventory.profiles, created],
          selectedProfile: created.id,
          isCreatingProfile: false,
          lastError: null,
        }));
        return created;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isCreatingProfile: false,
          lastError: `Unable to create Claude profile: ${String(error)}`,
        }));
        return null;
      }
    },
    [],
  );

  const validateLocally = useCallback(async () => {
    const status = await invoke<{ running: boolean }>("get_codex_router_status");
    if (!status.running) throw new Error("Start Model Pool Routing before connecting Claude Code");
    if (!state.modelMappings.default) throw new Error(DEFAULT_SLOT_HINT);
  }, [state.modelMappings]);

  const testConnection = useCallback(async () => {
    setState((prev) => ({ ...prev, isConnecting: true, lastError: null }));
    try {
      if (bindingId) {
        const active = await invoke<boolean>("get_claude_gateway_status", { bindingId });
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          connectionStatus: active ? "connected" : "degraded",
        }));
        return active;
      }
      await validateLocally();
      setState((prev) => ({ ...prev, isConnecting: false }));
      return true;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        connectionStatus: "failed",
        lastError: error instanceof Error ? error.message : String(error),
      }));
      return false;
    }
  }, [bindingId, validateLocally]);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, isConnecting: true, lastError: null }));
    try {
      await validateLocally();
      if (!state.selectedInstallation || !state.selectedProfile) {
        throw new Error("Choose a Claude installation and profile");
      }
      const result = await invoke<ClaudeConnectResult>("connect_claude_code", {
        installationPath: state.selectedInstallation,
        profileId: state.selectedProfile,
        mode: state.connectionMode,
        mappings: Object.fromEntries(Object.entries(state.modelMappings).filter(([, v]) => v)),
      });
      setBindingId(result.bindingId);
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        connectionStatus: "connected",
      }));
      return true;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        connectionStatus: "failed",
        lastError: error instanceof Error ? error.message : String(error),
      }));
      return false;
    }
  }, [state, validateLocally]);

  return {
    ...state,
    setInstallation,
    setProfile,
    setMode,
    setSlotMapping,
    createProfile,
    testConnection,
    connect,
  };
}
