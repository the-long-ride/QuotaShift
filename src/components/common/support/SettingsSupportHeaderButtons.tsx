import React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useGithubStarCount } from "../../../hooks/desktop/useGithubStarCount";
import {
  GITHUB_DONATE_URL,
  GITHUB_REPO_URL,
  formatStarCount,
} from "../../../utils/common/support-prompt";
import { SupportHeartIcon, SupportStarIcon } from "./SupportIcons";

interface SettingsSupportHeaderButtonsProps {
  isOpen: boolean;
}

export const SettingsSupportHeaderButtons: React.FC<SettingsSupportHeaderButtonsProps> = ({
  isOpen,
}) => {
  const starLabel = formatStarCount(useGithubStarCount(isOpen));

  return (
    <>
      <button
        type="button"
        className="settings-modal-support-btn settings-modal-support-btn--star"
        onClick={() => void openUrl(GITHUB_REPO_URL)}
        data-tooltip="Star QuotaShift on GitHub"
        aria-label="Star QuotaShift on GitHub"
      >
        <SupportStarIcon size={11} filled={false} />
        <span>Star</span>
        {starLabel !== null && <span className="settings-modal-support-count">{starLabel}</span>}
      </button>
      <button
        type="button"
        className="settings-modal-support-btn settings-modal-support-btn--donate"
        onClick={() => void openUrl(GITHUB_DONATE_URL)}
        data-tooltip="Support QuotaShift developer"
        aria-label="Donate"
      >
        <SupportHeartIcon size={11} filled={false} />
        <span>Donate</span>
      </button>
    </>
  );
};
