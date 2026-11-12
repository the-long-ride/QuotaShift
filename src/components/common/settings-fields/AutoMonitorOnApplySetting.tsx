import React, { useState } from "react";
import { SettingsSwitchRow } from "../settings-controls/SettingsSwitchRow";
import { PersistentMonitorIcon } from "../settings-controls/SettingsIcons";
import {
  loadAutoMonitorOnApply,
  loadUnmonitorSameProviderOnApply,
  saveAutoMonitorOnApply,
  saveUnmonitorSameProviderOnApply,
} from "../../../utils/common/settings/auto-monitor-on-apply";

export const AutoMonitorOnApplySetting: React.FC = () => {
  const [enabled, setEnabled] = useState(loadAutoMonitorOnApply);
  const [removeSame, setRemoveSame] = useState(loadUnmonitorSameProviderOnApply);
  return (
    <>
      <SettingsSwitchRow icon={<PersistentMonitorIcon />}
        label="Auto-monitor applied account"
        description="Add the applied account without replacing other tracked accounts (up to 3). Enabling also enables multi-account tracking."
        checked={enabled}
        onToggle={() => { saveAutoMonitorOnApply(!enabled); setEnabled(!enabled); }} />
      {enabled && (
        <SettingsSwitchRow icon={<PersistentMonitorIcon />}
          label="Unmonitor other accounts on the same platform"
          description="Only when applying an account: remove previously monitored accounts from the same provider, never from another provider."
          checked={removeSame}
          onToggle={() => {
            saveUnmonitorSameProviderOnApply(!removeSame);
            setRemoveSame(!removeSame);
          }} />
      )}
    </>
  );
};
