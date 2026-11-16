import { useEffect, useState } from "react";
import {
  firstVisiblePlatform,
  loadPlatformVisibilityPreference,
  savePlatformVisibilityPreference,
  type PlatformId,
  type PlatformVisibility,
} from "../../utils/common/ui/platform-visibility";

export function useAppNavigation(activeTab: PlatformId, setActiveTab: (tab: PlatformId) => void) {
  const [platformVisibility, setPlatformVisibility] = useState<PlatformVisibility>(() =>
    loadPlatformVisibilityPreference(),
  );
  const [codexSection, setCodexSection] = useState<"accounts" | "pools">("accounts");

  useEffect(() => {
    if (platformVisibility[activeTab]) return;
    const next = firstVisiblePlatform(platformVisibility);
    if (next) setActiveTab(next);
  }, [activeTab, platformVisibility, setActiveTab]);

  const handlePlatformVisibilityChange = (platform: PlatformId, visible: boolean) =>
    setPlatformVisibility((prev) => {
      const next = { ...prev, [platform]: visible };
      savePlatformVisibilityPreference(next);
      return next;
    });

  const handleOpenModelRouting = () => {
    if (!platformVisibility.codex) handlePlatformVisibilityChange("codex", true);
    setActiveTab("codex");
    setCodexSection("pools");
  };

  return {
    platformVisibility,
    handlePlatformVisibilityChange,
    codexSection,
    setCodexSection,
    handleOpenModelRouting,
  };
}
