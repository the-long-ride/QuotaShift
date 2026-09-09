import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ClaudeLogo } from "./ClaudeLogo";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { currentMonitor, primaryMonitor, availableMonitors } from "@tauri-apps/api/window";

export interface OverlayQuotaRow {
  label: string;       // "Gemini" | "Claude" | "OpenAI"
  fiveHourPercent: number | null;
  weeklyPercent: number | null;
}

export interface OverlaySingleBar {
  label: string;       // "5h" | "Wk" | "Mo" | "Day" | "Spend"
  percent: number | null;
}

export interface OverlayAccountData {
  provider: "antigravity" | "codex";
  accountId?: string | null;
  label: string;
  email?: string | null;
  avatarUrl?: string | null;
  tier?: string | null;
  fiveHourPercent?: number | null;
  weeklyPercent?: number | null;
  singleBars?: OverlaySingleBar[];
  quotaRows?: OverlayQuotaRow[];
  loading?: boolean;
}

const STORAGE_OVERLAY_DATA_KEY = "quotashift_overlay_data";
const STORAGE_OVERLAY_POS_KEY  = "quotashift_overlay_pos";
const DRAG_THRESHOLD_PX = 4;
const DOUBLE_CLICK_WINDOW_MS = 500;
const DOUBLE_CLICK_DISTANCE_PX = 6;

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

/** Resolves tier text to strictly PRO or FREE */
export function resolveTierBadgeText(tier: string | null | undefined): "PRO" | "FREE" {
  if (!tier) return "FREE";
  const lower = tier.toLowerCase();
  if (lower.includes("free")) return "FREE";
  if (
    lower.includes("pro") ||
    lower.includes("plus") ||
    lower.includes("ultra") ||
    lower.includes("team") ||
    lower.includes("advanced") ||
    lower.includes("enterprise") ||
    lower.includes("paid") ||
    lower.includes("standard")
  ) {
    return "PRO";
  }
  return "FREE";
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
  <div className="overlay-metric-row">
    <span className="overlay-metric-label">{rowLabel}</span>
    <div className="overlay-progress-track">
      <div className="overlay-progress-bar" style={barColorStyle(pct)} />
    </div>
    <span className="overlay-metric-pct" style={{ color: barColor(pct) }}>
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
    <div className="overlay-family-col">
      {/* Centered logo: Gemini on left column, [Claude] ~ [OpenAI] on right column */}
      <div className="overlay-family-logo">
        {isGemini ? (
          <GeminiLogo size={13} />
        ) : (
          <div className="overlay-dual-logo">
            <ClaudeLogo size={12} />
            <span className="overlay-logo-sep">~</span>
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
    const winSize = await win.outerSize();
    const monitors = await availableMonitors();

    if (monitors && monitors.length > 0) {
      let unionLeft = Infinity;
      let unionTop = Infinity;
      let unionRight = -Infinity;
      let unionBottom = -Infinity;

      for (const m of monitors) {
        const workPos = m.workArea?.position ?? m.position;
        const workSize = m.workArea?.size ?? m.size;
        if (workPos.x < unionLeft) unionLeft = workPos.x;
        if (workPos.y < unionTop) unionTop = workPos.y;
        if (workPos.x + workSize.width > unionRight) unionRight = workPos.x + workSize.width;
        if (workPos.y + workSize.height > unionBottom) unionBottom = workPos.y + workSize.height;
      }

      const clampedX = Math.max(unionLeft, Math.min(unionRight - winSize.width, targetPos.x));
      const clampedY = Math.max(unionTop, Math.min(unionBottom - winSize.height, targetPos.y));
      return { x: clampedX, y: clampedY };
    }

    const monitor = (await currentMonitor()) ?? (await primaryMonitor());
    if (!monitor) return null;

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
  const lastWindowPosRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuState, setMenuState] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
  }>({ isOpen: false, x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const monitorBoundsRef = useRef<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);

  const updateMonitorBounds = async () => {
    try {
      const win = getCurrentWebviewWindow();
      const winSize = await win.outerSize();
      const monitors = await availableMonitors();
      if (!monitors || monitors.length === 0) {
        // Fallback to current monitor only
        const monitor = (await currentMonitor()) ?? (await primaryMonitor());
        if (!monitor) return;
        const workPos = monitor.workArea?.position ?? monitor.position;
        const workSize = monitor.workArea?.size ?? monitor.size;
        monitorBoundsRef.current = {
          minX: workPos.x,
          maxX: Math.max(workPos.x, workPos.x + workSize.width - winSize.width),
          minY: workPos.y,
          maxY: Math.max(workPos.y, workPos.y + workSize.height - winSize.height),
        };
        return;
      }

      // Compute the union bounding rect of all monitors' work areas so the
      // overlay can be dragged freely to any connected display.
      let unionLeft = Infinity;
      let unionTop = Infinity;
      let unionRight = -Infinity;
      let unionBottom = -Infinity;

      for (const m of monitors) {
        const workPos = m.workArea?.position ?? m.position;
        const workSize = m.workArea?.size ?? m.size;
        if (workPos.x < unionLeft) unionLeft = workPos.x;
        if (workPos.y < unionTop) unionTop = workPos.y;
        if (workPos.x + workSize.width > unionRight) unionRight = workPos.x + workSize.width;
        if (workPos.y + workSize.height > unionBottom) unionBottom = workPos.y + workSize.height;
      }

      monitorBoundsRef.current = {
        minX: unionLeft,
        maxX: Math.max(unionLeft, unionRight - winSize.width),
        minY: unionTop,
        maxY: Math.max(unionTop, unionBottom - winSize.height),
      };
    } catch {}
  };

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
        lastWindowPosRef.current = posToUse;
        const clamped = await clampPositionToScreen(posToUse);
        if (clamped) {
          lastWindowPosRef.current = clamped;
          await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
          try {
            localStorage.setItem(STORAGE_OVERLAY_POS_KEY, JSON.stringify(clamped));
          } catch {}
        }
      }
      await updateMonitorBounds();
    };
    initPos();

    // Save position on move (already hard-clamped at OS level via Win32 WM_MOVING)
    let unlistenMoved: (() => void) | undefined;
    let saveTimeout: number | undefined;
    win.onMoved((pos) => {
      lastWindowPosRef.current = { x: pos.payload.x, y: pos.payload.y };
      window.clearTimeout(saveTimeout);
      saveTimeout = window.setTimeout(() => {
        try {
          localStorage.setItem(
            STORAGE_OVERLAY_POS_KEY,
            JSON.stringify({ x: pos.payload.x, y: pos.payload.y })
          );
        } catch {}
      }, 150);
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
      window.clearTimeout(saveTimeout);
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
  // WebView2 can lose browser dblclick/native-drag sequencing on transparent
  // windows, so detect double-clicks ourselves and move the window manually.
  const dragOriginRef = useRef<{
    pointerX: number;
    pointerY: number;
    windowX: number;
    windowY: number;
  } | null>(null);
  const dragStartedRef = useRef(false);
  const pointerDownRef = useRef(false);
  const isMovingRef = useRef(false);
  const pendingTargetPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastPressRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const moveHandlerRef = useRef<(e: React.MouseEvent) => void>(() => {});

  const resetDragIntent = () => {
    pointerDownRef.current = false;
    dragOriginRef.current = null;
    dragStartedRef.current = false;
    isMovingRef.current = false;
    pendingTargetPosRef.current = null;
    if (lastWindowPosRef.current) {
      clampPositionToScreen(lastWindowPosRef.current).then((clamped) => {
        const finalPos = clamped || lastWindowPosRef.current;
        if (finalPos) {
          try {
            localStorage.setItem(
              STORAGE_OVERLAY_POS_KEY,
              JSON.stringify(finalPos)
            );
          } catch {}
        }
      }).catch(() => {});
    }
  };

  useEffect(() => {
    const handleGlobalRelease = () => {
      if (pointerDownRef.current) {
        resetDragIntent();
      }
    };
    const handleGlobalPointerMove = (e: MouseEvent) => {
      if (pointerDownRef.current) {
        moveHandlerRef.current(e as unknown as React.MouseEvent);
      }
    };
    window.addEventListener("pointermove", handleGlobalPointerMove, { passive: true });
    window.addEventListener("mousemove", handleGlobalPointerMove, { passive: true });
    window.addEventListener("pointerup", handleGlobalRelease);
    window.addEventListener("mouseup", handleGlobalRelease);
    window.addEventListener("blur", handleGlobalRelease);
    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("mousemove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalRelease);
      window.removeEventListener("mouseup", handleGlobalRelease);
      window.removeEventListener("blur", handleGlobalRelease);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerDownRef.current) {
      handleMouseMove(e as unknown as React.MouseEvent);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {}
      resetDragIntent();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (menuState.isOpen) {
      setMenuState((prev) => ({ ...prev, isOpen: false }));
    }
    if (e.button !== 0) return;

    updateMonitorBounds();

    const pointerX = e.screenX;
    const pointerY = e.screenY;
    const now = performance.now();
    const previousPress = lastPressRef.current;
    const isDoubleClick = previousPress !== null
      && now - previousPress.time <= DOUBLE_CLICK_WINDOW_MS
      && Math.hypot(pointerX - previousPress.x, pointerY - previousPress.y) <= DOUBLE_CLICK_DISTANCE_PX;

    if (isDoubleClick) {
      lastPressRef.current = null;
      resetDragIntent();
      invoke("show_dashboard").catch((err) => {
        console.warn("Failed to open main dashboard:", err);
      });
      return;
    }

    lastPressRef.current = { time: now, x: pointerX, y: pointerY };
    pointerDownRef.current = true;
    dragStartedRef.current = false;

    // Fast synchronous origin if last known position is cached
    const currentWindowPos = lastWindowPosRef.current;
    if (currentWindowPos) {
      dragOriginRef.current = {
        pointerX,
        pointerY,
        windowX: currentWindowPos.x,
        windowY: currentWindowPos.y,
      };
    } else {
      dragOriginRef.current = null;
    }

    getCurrentWebviewWindow().outerPosition().then((position) => {
      lastWindowPosRef.current = { x: position.x, y: position.y };
      if (!pointerDownRef.current || dragStartedRef.current) return;
      dragOriginRef.current = {
        pointerX,
        pointerY,
        windowX: position.x,
        windowY: position.y,
      };
    }).catch((err) => {
      console.warn("Failed to read overlay position for dragging:", err);
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const origin = dragOriginRef.current;
    if (!origin || !pointerDownRef.current) return;
    if ((e.buttons & 1) !== 1) {
      resetDragIntent();
      return;
    }

    const scale = window.devicePixelRatio || 1;
    const deltaX = (e.screenX - origin.pointerX) * scale;
    const deltaY = (e.screenY - origin.pointerY) * scale;
    if (!dragStartedRef.current && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;

    if (!dragStartedRef.current) {
      dragStartedRef.current = true;
      lastPressRef.current = null;
    }

    let targetX = Math.round(origin.windowX + deltaX);
    let targetY = Math.round(origin.windowY + deltaY);

    const bounds = monitorBoundsRef.current;
    if (bounds) {
      targetX = Math.max(bounds.minX, Math.min(targetX, bounds.maxX));
      targetY = Math.max(bounds.minY, Math.min(targetY, bounds.maxY));
    }

    pendingTargetPosRef.current = { x: targetX, y: targetY };

    if (isMovingRef.current) return;
    isMovingRef.current = true;

    const commitPosition = (posX: number, posY: number) => {
      lastWindowPosRef.current = { x: posX, y: posY };
      getCurrentWebviewWindow().setPosition(new PhysicalPosition(
        posX,
        posY,
      )).catch((err) => {
        console.warn("Failed to move overlay window:", err);
      }).finally(() => {
        isMovingRef.current = false;
        if (pointerDownRef.current && pendingTargetPosRef.current) {
          const next = pendingTargetPosRef.current;
          pendingTargetPosRef.current = null;
          if (next.x !== posX || next.y !== posY) {
            isMovingRef.current = true;
            commitPosition(next.x, next.y);
          }
        }
      });
    };

    pendingTargetPosRef.current = null;
    commitPosition(targetX, targetY);
  };

  moveHandlerRef.current = handleMouseMove;

  const handleMouseUp = () => {
    resetDragIntent();
  };

  useEffect(() => {
    if (!menuState.isOpen) return;

    const handleOutsideClick = (e: MouseEvent | PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".overlay-context-menu")) return;
      setMenuState((prev) => ({ ...prev, isOpen: false }));
    };

    const handleWindowBlur = () => {
      setMenuState((prev) => ({ ...prev, isOpen: false }));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuState((prev) => ({ ...prev, isOpen: false }));
      }
    };

    window.addEventListener("pointerdown", handleOutsideClick);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointerdown", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [menuState.isOpen]);

  useLayoutEffect(() => {
    if (!menuState.isOpen || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const winWidth = window.innerWidth || 340;
    const winHeight = window.innerHeight || 100;
    const pad = 4;

    let adjustedX = menuState.x;
    let adjustedY = menuState.y;

    if (adjustedX + rect.width > winWidth - pad) {
      adjustedX = Math.max(pad, winWidth - rect.width - pad);
    }
    if (adjustedY + rect.height > winHeight - pad) {
      adjustedY = Math.max(pad, winHeight - rect.height - pad);
    }

    adjustedX = Math.max(pad, Math.min(adjustedX, winWidth - rect.width - pad));
    adjustedY = Math.max(pad, Math.min(adjustedY, winHeight - rect.height - pad));

    const finalX = Math.round(adjustedX);
    const finalY = Math.round(adjustedY);

    if (finalX !== menuState.x || finalY !== menuState.y) {
      setMenuState((prev) => ({
        ...prev,
        x: finalX,
        y: finalY,
      }));
    }
  }, [menuState.isOpen]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const winWidth = window.innerWidth || 340;
    const winHeight = window.innerHeight || 100;

    const clickX = e.clientX;
    const clickY = e.clientY;

    const pad = 4;
    const menuWidth = 108;
    const menuHeight = 58;

    // Auto choose position to avoid edge boundaries and ensure full visibility.
    // 4-corner anchoring based on viewport fit:
    // - Right-click at Top-Left of menu if menu fits right & down
    // - Right-click at Top-Right of menu if menu overflows right
    // - Right-click at Bottom-Left of menu if menu overflows down
    // - Right-click at Bottom-Right of menu if menu overflows both right and down
    let posX = clickX;
    let posY = clickY;

    if (posX + menuWidth > winWidth - pad) {
      posX = Math.max(pad, clickX - menuWidth);
    }
    if (posY + menuHeight > winHeight - pad) {
      posY = Math.max(pad, clickY - menuHeight);
    }

    posX = Math.max(pad, Math.min(posX, winWidth - menuWidth - pad));
    posY = Math.max(pad, Math.min(posY, winHeight - menuHeight - pad));

    setMenuState({
      isOpen: true,
      x: Math.round(posX),
      y: Math.round(posY),
    });
  };

  const handleRefreshUsage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuState((prev) => ({ ...prev, isOpen: false }));
    setData((prev) => ({ ...prev, loading: true }));
    try {
      await emit("request-refresh-usage", {
        provider: data.provider,
        accountId: data.accountId,
      });
    } catch (err) {
      console.warn("Failed to request refresh from overlay:", err);
    }
  };

  const handleOpenDashboard = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuState((prev) => ({ ...prev, isOpen: false }));
    try {
      await invoke("show_dashboard");
    } catch (err) {
      console.warn("Failed to open dashboard:", err);
    }
  };

  const handleHideOverlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuState((prev) => ({ ...prev, isOpen: false }));
    try {
      localStorage.setItem("quotashift_overlay_enabled", "false");
      await emit("overlay-visibility-changed", false);
      await invoke("set_overlay_visible", { visible: false });
    } catch (err) {
      console.warn("Failed to hide overlay:", err);
    }
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
  const tierText = resolveTierBadgeText(data.tier);
  const cardClass = `glass-card glass-card--${data.provider}${hasRows ? " glass-card--wide" : ""}`;

  return (
    <div
      ref={containerRef}
      className={`overlay-container overlay-container--${data.provider}`}
      data-provider={data.provider}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}
      onLostPointerCapture={resetDragIntent}
    >
      <div
        className={cardClass}
        data-provider={data.provider}
        title="Drag to move • Double-click to open QuotaShift"
      >
        {/* Avatar + tier badge + provider badge */}
        <div className="overlay-avatar-wrap">
          <span className="overlay-tier-badge" title={`Plan tier: ${tierText}`}>
            {tierText}
          </span>
          {data.avatarUrl ? (
            <img
              className="overlay-avatar-img"
              src={data.avatarUrl}
              alt={data.label || "avatar"}
            />
          ) : (
            <div className="overlay-avatar-fallback">
              {initialLetter}
            </div>
          )}
          <span className="overlay-provider-badge">
            {isOpenAI ? <OpenAILogo size={10} /> : <AntigravityLogo size={10} />}
          </span>
        </div>

        {/* Metrics */}
        <div className="overlay-metrics">
          {hasRows ? (
            <div className="overlay-families-row">
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
          ) : data.singleBars && data.singleBars.length > 0 ? (
            <>
              {data.singleBars.map((bar, i) => (
                <BarRow key={i} rowLabel={bar.label} pct={clamp(bar.percent)} loading={loading} />
              ))}
            </>
          ) : (
            <>
              <BarRow rowLabel="5h" pct={fivePct} loading={loading} />
              {weeklyPct !== null && (
                <BarRow rowLabel="Wk" pct={weeklyPct} loading={loading} />
              )}
            </>
          )}
        </div>
      </div>

      {menuState.isOpen && (
        <div
          ref={menuRef}
          className="overlay-context-menu"
          style={{
            left: `${menuState.x}px`,
            top: `${menuState.y}px`,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button
            type="button"
            className="overlay-menu-item"
            onClick={handleRefreshUsage}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>Refresh usage</span>
          </button>
          <button
            type="button"
            className="overlay-menu-item"
            onClick={handleOpenDashboard}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            <span>Open dashboard</span>
          </button>
          <button
            type="button"
            className="overlay-menu-item overlay-menu-item--danger"
            onClick={handleHideOverlay}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            <span>Hide overlay</span>
          </button>
        </div>
      )}
    </div>
  );
};

