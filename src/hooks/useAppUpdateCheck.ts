import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { isNewerVersion, OFFICIAL_RELEASE_URL } from "../utils/common/update-policy";

export function useAppUpdateCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateTag, setUpdateTag] = useState("");
  const [updatePromptOpen, setUpdatePromptOpen] = useState(false);

  const checkForUpdates = async () => {
    try {
      const currentVersion = await getVersion();
      const res = await fetch(
        "https://api.github.com/repos/the-long-ride/QuotaShift/releases/latest",
      );
      if (!res.ok) return;
      const latestTag = (await res.json()).tag_name;
      if (
        latestTag &&
        isNewerVersion(currentVersion.replace(/^v/, ""), latestTag.replace(/^v/, ""))
      ) {
        setUpdateAvailable(true);
        setUpdateTag(latestTag);
      }
    } catch (err) {
      console.error("Check for updates failed:", err);
    }
  };

  const handleCheckUpdate = async (latestTag = "v1.0.1") => {
    setUpdateAvailable(true);
    setUpdateTag(latestTag);
    setUpdatePromptOpen(true);
  };

  const handleDownloadUpdate = async () => {
    setUpdatePromptOpen(false);
    await openUrl(OFFICIAL_RELEASE_URL);
  };

  return {
    updateAvailable,
    updateTag,
    updatePromptOpen,
    setUpdatePromptOpen,
    checkForUpdates,
    handleCheckUpdate,
    handleDownloadUpdate,
  };
}
