import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { currentMonitor, primaryMonitor } from "@tauri-apps/api/window";

export interface OverlayQuotaRow {
  label: string;       // "Gemini" | "Claude" | "OpenAI"
  fiveHourPercent: number | null;
  weeklyPercent: number | null;
}

export interface OverlayAccountData {
  provider: "antigravity" | "codex";
  label: string;
  email?: string | null;
  avatarUrl?: string | null;
  tier?: string | null;
  fiveHourPercent?: number | null;
  weeklyPercent?: number | null;
  quotaRows?: OverlayQuotaRow[];
  loading?: boolean;
}

const STORAGE_OVERLAY_DATA_KEY = "quotashift_overlay_data";
const STORAGE_OVERLAY_POS_KEY  = "quotashift_overlay_pos";

function loadInitialOverlayData(): OverlayAccountData {
  try {
    const raw = localStorage.getItem(STORAGE_OVERLAY_DATA_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { provider: "antigravity", label: "Loading...", loading: true };
}

// ── Colour helper ─────────────────────────────────────────────────────
/** Returns bar colour based on remaining percentage */
function barColor(pct: number | null): string {
  if (pct === null) return "rgba(255,255,255,0.25)";
  if (pct < 10) return "#ef4444";           // red
  if (pct < 20) return "#f97316";           // dark orange-red
  return "rgba(255,255,255,0.85)";          // white
}

// ── Provider / model logos ────────────────────────────────────────────

/** Antigravity: uses the real brand icon URL (same as main tab) */
const AntigravityLogo: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <img
    src="https://antigravity.google/assets/image/brand/antigravity-icon__white.png"
    width={size}
    height={size}
    alt="Antigravity"
    style={{ display: "block", objectFit: "contain" }}
  />
);

/** Codex / OpenAI: same SVG path used in main tab */
const OpenAILogo: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    xmlns="http://www.w3.org/2000/svg"
    fillRule="evenodd"
    clipRule="evenodd"
    strokeLinejoin="round"
    strokeMiterlimit={2}
    fill="white"
  >
    <path d="M474.123 209.81c11.525-34.577 7.569-72.423-10.838-103.904-27.696-48.168-83.433-72.94-137.794-61.414a127.14 127.14 0 00-95.475-42.49c-55.564 0-104.936 35.781-122.139 88.593-35.781 7.397-66.574 29.76-84.637 61.414-27.868 48.167-21.503 108.72 15.826 150.007-11.525 34.578-7.569 72.424 10.838 103.733 27.696 48.34 83.433 73.111 137.966 61.585 24.084 27.18 58.833 42.835 95.303 42.663 55.564 0 104.936-35.782 122.139-88.594 35.782-7.397 66.574-29.76 84.465-61.413 28.04-48.168 21.676-108.722-15.654-150.008v-.172zm-39.567-87.218c11.01 19.267 15.139 41.803 11.354 63.65-.688-.516-2.064-1.204-2.924-1.72l-101.152-58.49a16.965 16.965 0 00-16.687 0L206.621 194.5v-50.232l97.883-56.597c45.587-26.32 103.732-10.666 130.052 34.921zm-227.935 104.42l49.888-28.9 49.887 28.9v57.63l-49.887 28.9-49.888-28.9v-57.63zm23.223-191.81c22.364 0 43.867 7.742 61.07 22.02-.688.344-2.064 1.204-3.097 1.72L186.666 117.26c-5.161 2.925-8.258 8.43-8.258 14.45v136.934l-43.523-25.116V130.333c0-52.64 42.491-95.13 95.131-95.302l-.172.172zM52.14 168.697c11.182-19.268 28.557-34.062 49.544-41.803V247.14c0 6.02 3.097 11.354 8.258 14.45l118.354 68.295-43.695 25.288-97.711-56.425c-45.415-26.32-61.07-84.465-34.75-130.052zm26.665 220.71c-11.182-19.095-15.139-41.802-11.354-63.65.688.516 2.064 1.204 2.924 1.72l101.152 58.49a16.965 16.965 0 0016.687 0l118.354-68.467v50.232l-97.883 56.425c-45.587 26.148-103.732 10.665-130.052-34.75h.172zm204.54 87.39c-22.192 0-43.867-7.741-60.898-22.02a62.439 62.439 0 003.097-1.72l101.152-58.317c5.16-2.924 8.429-8.43 8.257-14.45V243.527l43.523 25.116v113.022c0 52.64-42.663 95.303-95.131 95.303v-.172zM461.22 343.303c-11.182 19.267-28.729 34.061-49.544 41.63V264.687c0-6.021-3.097-11.526-8.257-14.45L284.893 181.77l43.523-25.116 97.883 56.424c45.587 26.32 61.07 84.466 34.75 130.053l.172.172z" />
  </svg>
);

/** Gemini star logo */
const GeminiLogo: React.FC<{ size?: number }> = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14 28C14 26.0633 13.6267 24.2433 12.88 22.54C12.1567 20.8367 11.165 19.355 9.905 18.095C8.645 16.835 7.16333 15.8433 5.46 15.12C3.75667 14.3733 1.93667 14 0 14C1.93667 14 3.75667 13.6383 5.46 12.915C7.16333 12.1683 8.645 11.165 9.905 9.905C11.165 8.645 12.1567 7.16333 12.88 5.46C13.6267 3.75667 14 1.93667 14 0C14 1.93667 14.3617 3.75667 15.085 5.46C15.8317 7.16333 16.835 8.645 18.095 9.905C19.355 11.165 20.8367 12.1683 22.54 12.915C24.2433 13.6383 26.0633 14 28 14C26.0633 14 24.2433 14.3733 22.54 15.12C20.8367 15.8433 19.355 16.835 18.095 18.095C16.835 19.355 15.8317 20.8367 15.085 22.54C14.3617 24.2433 14 26.0633 14 28Z"
      fill="white"
    />
  </svg>
);

/** Claude logo — official SVG */
const ClaudeLogo: React.FC<{ size?: number }> = ({ size = 11 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 100 100" fill="white" data-tauri-drag-region>
    <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" data-tauri-drag-region />
  </svg>
);

// ── Single bar row ────────────────────────────────────────────────────

function barColorStyle(pct: number | null): React.CSSProperties {
  return { width: `${pct ?? 0}%`, background: barColor(pct) };
}

interface BarRowProps {
  rowLabel: string;
  pct: number | null;
  loading: boolean;
}
const BarRow: React.FC<BarRowProps> = ({ rowLabel, pct, loading }) => (
  <div className="overlay-metric-row" data-tauri-drag-region>
    <span className="overlay-metric-label" data-tauri-drag-region>{rowLabel}</span>
    <div className="overlay-progress-track" data-tauri-drag-region>
      <div className="overlay-progress-bar" style={barColorStyle(pct)} data-tauri-drag-region />
    </div>
    <span className="overlay-metric-pct" style={{ color: barColor(pct) }} data-tauri-drag-region>
      {loading && pct === null ? "…" : pct !== null ? `${pct}%` : "—"}
    </span>
  </div>
);

// ── One column in the horizontal multi-family layout ──────────────────

interface FamilyColProps {
  label: string;          // "Gemini" | "Claude" | "OpenAI"
  fivePct: number | null;
  weeklyPct: number | null;
  loading: boolean;
}

const FamilyCol: React.FC<FamilyColProps> = ({ label, fivePct, weeklyPct, loading }) => {
  const l = label.toLowerCase();
  const isGemini = l.includes("gemini");
  return (
    <div className="overlay-family-col" data-tauri-drag-region>
      {/* Centered logo: Gemini on left column, [Claude] ~ [OpenAI] on right column */}
      <div className="overlay-family-logo" data-tauri-drag-region>
        {isGemini ? (
          <GeminiLogo size={13} />
        ) : (
          <div className="overlay-dual-logo" data-tauri-drag-region>
            <ClaudeLogo size={12} />
            <span className="overlay-logo-sep" data-tauri-drag-region>~</span>
            <OpenAILogo size={12} />
          </div>
        )}
      </div>
      <BarRow rowLabel="5h" pct={fivePct} loading={loading} />
      <BarRow rowLabel="Wk" pct={weeklyPct} loading={loading} />
    </div>
  );
};

// ── Screen bounds clamping helper ─────────────────────────────────────
async function clampPositionToScreen(
  targetPos: { x: number; y: number }
): Promise<{ x: number; y: number } | null> {
  try {
    const win = getCurrentWebviewWindow();
    const monitor = (await currentMonitor()) ?? (await primaryMonitor());
    if (!monitor) return null;

    const winSize = await win.outerSize();
    const scale = monitor.scaleFactor ?? 1;

    // Use workArea to automatically exclude taskbar and docks
    const workPos = monitor.workArea?.position ?? monitor.position;
    const workSize = monitor.workArea?.size ?? monitor.size;
    const pad = Math.round(6 * scale);

    const minX = workPos.x + pad;
    const maxX = Math.max(minX, workPos.x + workSize.width - winSize.width - pad);
    const minY = workPos.y + pad;
    const maxY = Math.max(minY, workPos.y + workSize.height - winSize.height - pad);

    const clampedX = Math.max(minX, Math.min(maxX, targetPos.x));
    const clampedY = Math.max(minY, Math.min(maxY, targetPos.y));

    return { x: clampedX, y: clampedY };
  } catch (err) {
    console.warn("Failed to clamp position to screen:", err);
    return null;
  }
}

// ── Main component ────────────────────────────────────────────────────

export const OverlayApp: React.FC = () => {
  const [data, setData] = useState<OverlayAccountData>(loadInitialOverlayData);

  useEffect(() => {
    const win = getCurrentWebviewWindow();

    // Restore and clamp position to screen bounds on mount
    const initPos = async () => {
      let posToUse: { x: number; y: number } | null = null;
      try {
        const savedPos = localStorage.getItem(STORAGE_OVERLAY_POS_KEY);
        if (savedPos) {
          const parsed = JSON.parse(savedPos);
          if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
            posToUse = parsed;
          }
        }
      } catch {}

      if (!posToUse) {
        try {
          const currentOuter = await win.outerPosition();
          posToUse = { x: currentOuter.x, y: currentOuter.y };
        } catch {}
      }

      if (posToUse) {
        const clamped = await clampPositionToScreen(posToUse);
        if (clamped) {
          await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
          try {
            localStorage.setItem(STORAGE_OVERLAY_POS_KEY, JSON.stringify(clamped));
          } catch {}
        }
      }
    };
    initPos();

    // Save position on move (already hard-clamped at OS level via Win32 WM_MOVING)
    let unlistenMoved: (() => void) | undefined;
    win.onMoved((pos) => {
      try {
        localStorage.setItem(
          STORAGE_OVERLAY_POS_KEY,
          JSON.stringify({ x: pos.payload.x, y: pos.payload.y })
        );
      } catch {}
    }).then((u) => { unlistenMoved = u; }).catch(() => {});

    // Live overlay data updates
    let unlistenData: (() => void) | undefined;
    listen<OverlayAccountData>("overlay-data-update", (event) => {
      if (event.payload) {
        setData(event.payload);
        try { localStorage.setItem(STORAGE_OVERLAY_DATA_KEY, JSON.stringify(event.payload)); } catch {}
      }
    }).then((u) => { unlistenData = u; }).catch(() => {});

    // Cross-window storage sync
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_OVERLAY_DATA_KEY && e.newValue) {
        try { setData(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      if (unlistenMoved) unlistenMoved();
      if (unlistenData) unlistenData();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Dynamically sync overlay window width based on platform type (Codex is 70% width of Antigravity)
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    const targetWidth = data.provider === "codex" ? 238 : 340;
    win.setSize(new LogicalSize(targetWidth, 100)).catch(() => {});
  }, [data.provider]);

  // ── Drag & Double-click
  // startDragging on mousedown provides reliable drag across all platforms/webview2
  // without calling e.preventDefault() so double-click continues to work
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      getCurrentWebviewWindow().startDragging().catch(() => {});
    }
  };

  const handleDoubleClick = () => {
    invoke("show_dashboard").catch((err) => {
      console.warn("Failed to open main dashboard:", err);
    });
  };

  const loading  = data.loading ?? false;
  const rows     = data.quotaRows ?? [];
  const hasRows  = rows.length > 0;

  const clamp = (v: number | null | undefined) =>
    v !== null && v !== undefined ? Math.max(0, Math.min(100, Math.round(v))) : null;

  const fivePct   = clamp(data.fiveHourPercent);
  const weeklyPct = clamp(data.weeklyPercent);

  const initialLetter = (data.label || data.email || "Q")[0].toUpperCase();
  const isOpenAI = data.provider === "codex";
  const cardClass = `glass-card glass-card--${data.provider}${hasRows ? " glass-card--wide" : ""}`;

  return (
    <div
      className={`overlay-container overlay-container--${data.provider}`}
      data-provider={data.provider}
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
    >
      <div
        className={cardClass}
        data-provider={data.provider}
        data-tauri-drag-region
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title="Drag to move • Double-click to open QuotaShift"
      >
        {/* Avatar + provider badge */}
        <div className="overlay-avatar-wrap" data-tauri-drag-region>
          {data.avatarUrl ? (
            <img
              className="overlay-avatar-img"
              src={data.avatarUrl}
              alt={data.label || "avatar"}
              data-tauri-drag-region
            />
          ) : (
            <div className="overlay-avatar-fallback" data-tauri-drag-region>
              {initialLetter}
            </div>
          )}
          <span className="overlay-provider-badge" data-tauri-drag-region>
            {isOpenAI ? <OpenAILogo size={10} /> : <AntigravityLogo size={10} />}
          </span>
        </div>

        {/* Metrics */}
        <div className="overlay-metrics" data-tauri-drag-region>
          {hasRows ? (
            <div className="overlay-families-row" data-tauri-drag-region>
              {rows.map((row, i) => (
                <FamilyCol
                  key={i}
                  label={row.label}
                  fivePct={clamp(row.fiveHourPercent)}
                  weeklyPct={clamp(row.weeklyPercent)}
                  loading={loading}
                />
              ))}
            </div>
          ) : (
            <>
              <BarRow rowLabel="5h" pct={fivePct} loading={loading} />
              <BarRow rowLabel="Wk" pct={weeklyPct} loading={loading} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

