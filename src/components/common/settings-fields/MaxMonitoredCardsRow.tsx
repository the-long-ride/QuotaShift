import React, { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { useMaxMonitoredCards } from "../../../hooks/desktop/useMaxMonitoredCards";
import {
  MAX_MONITORED_CARDS_DEFAULT,
  MAX_MONITORED_CARDS_MAX,
  MAX_MONITORED_CARDS_MIN,
  MAX_MONITORED_CARDS_TAURI_EVENT,
  normalizeMaxMonitoredCards,
  saveMaxMonitoredCards,
} from "../../../utils/common/settings/max-monitored-cards";

const MaxMonitoredCardsIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="6" rx="1.5" />
    <rect x="3" y="14" width="18" height="6" rx="1.5" />
  </svg>
);

export const MaxMonitoredCardsRow: React.FC = () => {
  const maxCards = useMaxMonitoredCards();
  const [draft, setDraft] = useState<string>(() => String(maxCards));

  useEffect(() => {
    setDraft(String(maxCards));
  }, [maxCards]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    const target =
      trimmed === "" ? MAX_MONITORED_CARDS_DEFAULT : normalizeMaxMonitoredCards(trimmed);
    const saved = saveMaxMonitoredCards(target);
    setDraft(String(saved));
    void emit(MAX_MONITORED_CARDS_TAURI_EVENT, saved).catch(() => {});
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = event.target.value;
    setDraft(val);
    const parsed = Number(val);
    if (
      val.trim() !== "" &&
      Number.isInteger(parsed) &&
      parsed >= MAX_MONITORED_CARDS_MIN &&
      parsed <= MAX_MONITORED_CARDS_MAX
    ) {
      const saved = saveMaxMonitoredCards(parsed);
      void emit(MAX_MONITORED_CARDS_TAURI_EVENT, saved).catch(() => {});
    }
  };

  return (
    <div className="settings-toggle-row settings-toggle-row--segmented">
      <span className="settings-row-icon">
        <MaxMonitoredCardsIcon />
      </span>
      <span className="settings-toggle-copy">
        <label className="settings-toggle-label" htmlFor="max-monitored-cards">
          Max monitored account cards
        </label>
        <span className="settings-toggle-description">
          Maximum accounts shown at once (1–20); scroll or use arrows when more are tracked.
        </span>
      </span>
      <div className="settings-input-row">
        <input
          id="max-monitored-cards"
          type="number"
          className="settings-number-input"
          min={MAX_MONITORED_CARDS_MIN}
          max={MAX_MONITORED_CARDS_MAX}
          step={1}
          value={draft}
          onChange={handleChange}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit(draft);
              event.currentTarget.blur();
            }
          }}
          aria-label="Max monitored account cards"
        />
        <span className="settings-unit">cards</span>
      </div>
    </div>
  );
};
