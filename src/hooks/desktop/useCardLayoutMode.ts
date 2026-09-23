import { useEffect, useState } from "react";
import {
  loadCardLayoutModePreference,
  saveCardLayoutModePreference,
} from "../../utils/common/card-layout-mode";

export type CardLayoutMode = "compact" | "expanded";

export function useCardLayoutMode() {
  const [cardLayoutMode, setCardLayoutMode] = useState<CardLayoutMode>(() =>
    loadCardLayoutModePreference(),
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-card-mode", cardLayoutMode);
  }, [cardLayoutMode]);

  const handleCardLayoutModeChange = (mode: CardLayoutMode) => {
    setCardLayoutMode(mode);
    saveCardLayoutModePreference(mode);
  };

  return { cardLayoutMode, handleCardLayoutModeChange };
}
