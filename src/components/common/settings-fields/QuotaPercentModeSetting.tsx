import React from "react";
import { SettingsSwitchRow } from "../settings-controls/SettingsSwitchRow";
import { PersistentMonitorIcon } from "../settings-controls/SettingsIcons";
import { useQuotaPercentMode } from "../../../hooks/desktop/useQuotaPercentMode";
import { saveQuotaPercentMode } from "../../../utils/common/settings/quota-percent-mode";

export const QuotaPercentModeSetting: React.FC = () => {
  const enabled = useQuotaPercentMode();
  return <SettingsSwitchRow icon={<PersistentMonitorIcon />} label="Show quota used instead of remaining"
    description="Reverse the displayed percentage and progress bars; low-remaining alerts still use remaining quota."
    checked={enabled} onToggle={() => saveQuotaPercentMode(!enabled)} />;
};
