import React from "react";
import { ClaudeResourceSaverIcon, KeepAliveIcon, PersistentMonitorIcon } from "./SettingsIcons";
import { SettingsSwitchRow } from "./SettingsSwitchRow";

export interface BehaviorSettingsSectionProps {
  keepAliveActive: boolean;
  onToggleKeepAlive: () => void;
  persistentWorkersEnabled: boolean;
  onTogglePersistentWorkers: () => void;
  reduceClaudeLowUsageFrequency: boolean;
  onToggleReduceClaudeLowUsageFrequency: () => void;
}

export const BehaviorSettingsSection: React.FC<BehaviorSettingsSectionProps> = ({
  keepAliveActive,
  onToggleKeepAlive,
  persistentWorkersEnabled,
  onTogglePersistentWorkers,
  reduceClaudeLowUsageFrequency,
  onToggleReduceClaudeLowUsageFrequency,
}) => (
  <>
    {/* Keep-Alive */}
    <SettingsSwitchRow
      icon={<KeepAliveIcon />}
      label="Keep-alive"
      description="Refreshes saved Antigravity credentials in the background to keep sessions active."
      checked={keepAliveActive}
      onToggle={onToggleKeepAlive}
    />
    {/* Persistent AG Monitor */}
    <SettingsSwitchRow
      icon={<PersistentMonitorIcon />}
      label={
        <>
          Persistent AG monitor <strong className="settings-experimental">Experimental</strong>
        </>
      }
      description="Keeps isolated Antigravity monitoring workers running for exact quota updates."
      checked={persistentWorkersEnabled}
      onToggle={onTogglePersistentWorkers}
    />
    {/* Claude Code Low Usage Resource Saver */}
    <SettingsSwitchRow
      icon={<ClaudeResourceSaverIcon />}
      label="Reduce frequency refresh claude code usage"
      description="reduce frequency refresh claude code usage to saving device resource"
      checked={reduceClaudeLowUsageFrequency}
      onToggle={onToggleReduceClaudeLowUsageFrequency}
    />
  </>
);
