import React from "react";
import {
  ClaudeResourceSaverIcon,
  KeepAliveIcon,
  PersistentMonitorIcon,
} from "../settings-controls/SettingsIcons";
import { ExperimentalTag } from "../dialogs/ExperimentalTag";
import { SettingsSwitchRow } from "../settings-controls/SettingsSwitchRow";
import { RestartOnSwitchSetting } from "../settings-controls/RestartOnSwitchSetting";
import { ClaudeResetCreditsSetting } from "../settings-fields/ClaudeResetCreditsSetting";
import { CliRotationSettings } from "../cli-pools/CliRotationSettings";
import { AutoMonitorOnApplySetting } from "../settings-fields/AutoMonitorOnApplySetting";
import { QuotaPercentModeSetting } from "../settings-fields/QuotaPercentModeSetting";
import { AgentApiSettings } from "../agent-api/AgentApiSettings";

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
    {/* Antigravity & ChatGPT Codex Group */}
    <div className="settings-subsection">
      <div className="settings-subsection-title">Antigravity & ChatGPT Codex</div>
      <SettingsSwitchRow
        icon={<KeepAliveIcon />}
        label="Keep-alive"
        description="Keeps saved Antigravity accounts and the local Codex sign-in active in the background."
        checked={keepAliveActive}
        onToggle={onToggleKeepAlive}
      />
      <SettingsSwitchRow
        icon={<PersistentMonitorIcon />}
        label={
          <>
            Persistent AG monitor <ExperimentalTag />
          </>
        }
        description="Keeps isolated Antigravity monitoring workers running for exact quota updates."
        checked={persistentWorkersEnabled}
        onToggle={onTogglePersistentWorkers}
      />
    </div>
    <div className="settings-subsection">
      <div className="settings-subsection-title">Account Switching</div>
      <RestartOnSwitchSetting />
    </div>
    <div className="settings-subsection">
      <div className="settings-subsection-title">Auto-monitoring</div>
      <AutoMonitorOnApplySetting />
    </div>
    <div className="settings-subsection">
      <div className="settings-subsection-title">Quota Display</div>
      <QuotaPercentModeSetting />
    </div>
    <div className="settings-subsection">
      <div className="settings-subsection-title">CLI Rotation</div>
      <CliRotationSettings />
    </div>

    <div className="settings-subsection">
      <div className="settings-subsection-title">AI Agent API</div>
      <AgentApiSettings />
    </div>

    {/* Claude Code Group */}
    <div className="settings-subsection">
      <div className="settings-subsection-title">Claude Code</div>
      <SettingsSwitchRow
        icon={<ClaudeResourceSaverIcon />}
        label="Reduce frequency refresh claude code usage"
        description="reduce frequency refresh claude code usage to saving device resource"
        checked={reduceClaudeLowUsageFrequency}
        onToggle={onToggleReduceClaudeLowUsageFrequency}
      />
      <ClaudeResetCreditsSetting />
    </div>
  </>
);
