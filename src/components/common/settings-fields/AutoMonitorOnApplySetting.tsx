import React, { useState } from "react";
import { SettingsSwitchRow } from "../settings-controls/SettingsSwitchRow";
import { PersistentMonitorIcon } from "../settings-controls/SettingsIcons";
import { loadAutoMonitorOnApply, saveAutoMonitorOnApply } from "../../../utils/common/settings/auto-monitor-on-apply";

export const AutoMonitorOnApplySetting: React.FC = () => {
  const [enabled, setEnabled] = useState(loadAutoMonitorOnApply);
  return <SettingsSwitchRow icon={<PersistentMonitorIcon />} label="Auto-monitor applied account"
    description="After a successful Apply, monitor that account. OFF preserves existing monitoring."
    checked={enabled} onToggle={() => { saveAutoMonitorOnApply(!enabled); setEnabled(!enabled); }} />;
};
