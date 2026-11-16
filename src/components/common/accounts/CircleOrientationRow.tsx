import React, { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  CIRCLE_ORIENTATION_EVENT,
  CIRCLE_ORIENTATION_KEY,
  loadCircleOrientation,
  normalizeCircleOrientation,
  saveCircleOrientation,
  type CircleOrientation,
} from "../../../utils/common/overlay/circle-layout";

const ORIENTATION_OPTIONS: Array<{
  orientation: CircleOrientation;
  label: string;
  tooltip: string;
}> = [
  { orientation: "vertical", label: "Vertical", tooltip: "Stack overlay vertically" },
  { orientation: "horizontal", label: "Horizontal", tooltip: "Arrange overlay horizontally" },
];

/** Settings row (shown when Card or Circle overlay mode is active) to swap vertical/horizontal layout. */
export const CircleOrientationRow: React.FC = () => {
  const [orientation, setOrientation] = useState<CircleOrientation>(() => loadCircleOrientation());

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<CircleOrientation>(CIRCLE_ORIENTATION_EVENT, (event) => {
      setOrientation(normalizeCircleOrientation(event.payload));
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    const handleStorage = (event: StorageEvent) => {
      if (event.key === CIRCLE_ORIENTATION_KEY) setOrientation(loadCircleOrientation());
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const handleChange = (next: CircleOrientation) => {
    const saved = saveCircleOrientation(next);
    setOrientation(saved);
    void emit(CIRCLE_ORIENTATION_EVENT, saved).catch(() => {});
  };

  return (
    <div
      className="settings-toggle-row settings-toggle-row--segmented"
      aria-label="Overlay Stack Layout"
    >
      <span className="settings-row-icon" aria-hidden="true">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 3l4 4-4 4" />
          <path d="M20 7H4" />
          <path d="M8 21l-4-4 4-4" />
          <path d="M4 17h16" />
        </svg>
      </span>
      <span className="settings-toggle-copy">
        <span className="settings-toggle-label">Overlay stack layout</span>
        <span className="settings-toggle-description">
          Arrange overlay cards or circles vertically or horizontally on screen.
        </span>
      </span>
      <div
        className="settings-segmented-switch"
        role="group"
        aria-label="Overlay Orientation"
        data-segments="2"
        data-active-index={orientation === "horizontal" ? 1 : 0}
      >
        {ORIENTATION_OPTIONS.map(({ orientation: opt, label, tooltip }) => (
          <button
            key={opt}
            type="button"
            className={`settings-segment-btn ${orientation === opt ? "settings-segment-btn--active" : ""}`}
            aria-pressed={orientation === opt}
            onClick={() => handleChange(opt)}
            data-tooltip={tooltip}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};
