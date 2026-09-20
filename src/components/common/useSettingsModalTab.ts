import { useEffect, useRef } from "react";
import { useCloseOnEscape } from "./useCloseOnEscape";
import type { SettingsTab } from "./settings-types";

export function useSettingsModalTab(activeTab: SettingsTab, isOpen: boolean, onClose: () => void) {
  const tabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement>>>({});

  useEffect(() => {
    if (isOpen) {
      tabRefs.current[activeTab]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeTab, isOpen]);

  useCloseOnEscape(isOpen, onClose);

  return tabRefs;
}
