import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { TaskbarColumn } from "./TaskbarColumn";
import { TaskbarNavArrow } from "./TaskbarNavArrow";
import { useTaskbarSlide } from "./useTaskbarSlide";
import {
  getNativeScale,
  useNativeZoomCompensation,
} from "../../hooks/desktop/useNativeZoomCompensation";

export const MAX_VISIBLE_TASKBAR_ACCOUNTS = 3;
import { APP_THEME_EVENT, THEME_KEY } from "../../utils/common/app-constants";
import {
  UI_ADJUSTMENT_EVENT,
  UI_ADJUSTMENT_STORAGE_KEY,
  loadUiAdjustmentPreferences,
  type OverlayTheme,
  type UiAdjustmentPreferences,
} from "../../utils/common/ui-adjustment";
import type { OverlayAccountData } from "../../utils/common/overlay-types";
import {
  buildTaskbarColumns,
  taskbarTooltipText,
  type TaskbarColumn as Column,
} from "../../utils/common/taskbar-columns";
import { FOCUS_ACCOUNT_CARD_EVENT } from "../../utils/common/account-card-scroll";

const OVERLAY_DATA_KEY = "quotashift_overlay_data";

const readInitialData = (): OverlayAccountData | null => {
  try {
    const raw = localStorage.getItem(OVERLAY_DATA_KEY);
    return raw ? (JSON.parse(raw) as OverlayAccountData) : null;
  } catch {
    return null;
  }
};

export const TaskbarApp: React.FC = () => {
  const [data, setData] = useState<OverlayAccountData | null>(readInitialData);
  const [overlayTheme, setOverlayTheme] = useState<OverlayTheme>(
    () => loadUiAdjustmentPreferences().overlayTheme,
  );
  const [appTheme, setAppTheme] = useState<"light" | "dark">(() =>
    (localStorage.getItem(THEME_KEY) || "dark") === "light" ? "light" : "dark",
  );
  const stripRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(() => buildTaskbarColumns(data), [data]);
  const [startIndex, setStartIndex] = useState(0);

  useEffect(() => {
    setStartIndex((prev) => {
      const maxStart = Math.max(0, columns.length - MAX_VISIBLE_TASKBAR_ACCOUNTS);
      return Math.min(prev, maxStart);
    });
  }, [columns.length]);

  const hasMultiple = columns.length > MAX_VISIBLE_TASKBAR_ACCOUNTS;
  const visibleColumns = useMemo(
    () =>
      hasMultiple ? columns.slice(startIndex, startIndex + MAX_VISIBLE_TASKBAR_ACCOUNTS) : columns,
    [columns, hasMultiple, startIndex],
  );
  const hasPrev = hasMultiple && startIndex > 0;
  const hasNext = hasMultiple && startIndex + MAX_VISIBLE_TASKBAR_ACCOUNTS < columns.length;

  const lastWheelTimeRef = useRef(0);
  const handleWheel = (event: React.WheelEvent) => {
    if (!hasMultiple) return;
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 160) return;
    const delta = event.deltaY || event.deltaX;
    if (Math.abs(delta) < 8) return;
    lastWheelTimeRef.current = now;
    if (delta > 0) {
      setStartIndex((prev) => Math.min(columns.length - MAX_VISIBLE_TASKBAR_ACCOUNTS, prev + 1));
    } else {
      setStartIndex((prev) => Math.max(0, prev - 1));
    }
  };

  useNativeZoomCompensation();
  useTaskbarSlide(stripRef, startIndex);

  useEffect(() => {
    const applyAppTheme = (theme?: string | null) => {
      const next = theme === "light" ? "light" : "dark";
      setAppTheme(next);
      document.documentElement.setAttribute("data-theme", next);
    };

    const applyTheme = (theme?: OverlayTheme) => {
      const next = theme === "mono" ? "mono" : "glassmorphism";
      setOverlayTheme(next);
      document.documentElement.setAttribute("data-overlay-theme", next);
    };

    applyAppTheme(localStorage.getItem(THEME_KEY));
    applyTheme(loadUiAdjustmentPreferences().overlayTheme);

    let unlistenData: (() => void) | undefined;
    let unlistenUi: (() => void) | undefined;
    let unlistenTheme: (() => void) | undefined;

    void listen<OverlayAccountData>("overlay-data-update", (event) => setData(event.payload)).then(
      (u) => {
        unlistenData = u;
      },
    );

    void listen<UiAdjustmentPreferences & { appTheme?: string }>(UI_ADJUSTMENT_EVENT, (event) => {
      if (event.payload?.appTheme) applyAppTheme(event.payload.appTheme);
      if (event.payload?.overlayTheme) applyTheme(event.payload.overlayTheme);
    }).then((u) => {
      unlistenUi = u;
    });

    void listen<string>(APP_THEME_EVENT, (event) => {
      applyAppTheme(event.payload);
    }).then((u) => {
      unlistenTheme = u;
    });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === UI_ADJUSTMENT_STORAGE_KEY) {
        applyTheme(loadUiAdjustmentPreferences().overlayTheme);
      }
      if (event.key === THEME_KEY) applyAppTheme(event.newValue);
    };
    window.addEventListener("storage", handleStorage);

    void getCurrentWebviewWindow()
      .setFocusable(false)
      .catch(() => {});

    return () => {
      unlistenData?.();
      unlistenUi?.();
      unlistenTheme?.();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // The native strip is sized by Rust from this report (CSS px), so the content drives it.
  // Layout sizes (`scrollWidth` is the full width even while the window is too narrow) stay in
  // native px when leaked page zoom is scaled back by a transform, unlike getBoundingClientRect.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const report = () => {
      const rect = strip.getBoundingClientRect();
      const measuredWidth = Math.ceil(Math.max(rect.width, strip.scrollWidth, strip.offsetWidth));
      invoke("set_taskbar_content_size", {
        width: measuredWidth + 4,
        height: Math.ceil(Math.max(rect.height, strip.scrollHeight, strip.offsetHeight)),
      }).catch(() => {});
    };
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [columns, startIndex]);

  const isMenuOpenRef = useRef(false);

  useEffect(() => {
    let unlistenClosed: (() => void) | undefined;
    void listen("taskbar-menu-closed", () => {
      isMenuOpenRef.current = false;
    }).then((u) => {
      unlistenClosed = u;
    });
    return () => {
      unlistenClosed?.();
    };
  }, []);

  // Bumped by every leave: a hover whose position lookup is still pending must not show its
  // card after the pointer has already left, or nothing is left to hide it again.
  const hoverSeqRef = useRef(0);

  const hideTooltip = () => {
    hoverSeqRef.current += 1;
    if (!isMenuOpenRef.current) {
      void emit("overlay-tooltip-data", { visible: false }).catch(() => {});
    }
  };

  // The tooltip window sizes itself to the hover card and sits just above the strip.
  const showTooltip = (column: Column, element: HTMLElement) => {
    if (isMenuOpenRef.current) return;
    const hoverSeq = ++hoverSeqRef.current;
    const scale = getNativeScale();
    const dpr = window.devicePixelRatio || scale;
    const rect = element.getBoundingClientRect();
    getCurrentWebviewWindow()
      .outerPosition()
      .then((pos) => {
        if (hoverSeq !== hoverSeqRef.current || isMenuOpenRef.current) return;
        const cardCenterX = Math.round(pos.x + (rect.left + rect.width / 2) * dpr);
        void emit("overlay-tooltip-data", {
          text: taskbarTooltipText(column),
          details: column.details,
          placement: "above",
          x: cardCenterX,
          y: pos.y,
          cardCenterX,
          anchorY: pos.y,
          visible: true,
        });
      })
      .catch(() => {});
  };

  const showMenu = (column: Column, element: HTMLElement) => {
    hoverSeqRef.current += 1;
    isMenuOpenRef.current = true;
    const scale = getNativeScale();
    const dpr = window.devicePixelRatio || scale;
    const rect = element.getBoundingClientRect();
    getCurrentWebviewWindow()
      .outerPosition()
      .then((pos) => {
        const cardCenterX = Math.round(pos.x + (rect.left + rect.width / 2) * dpr);
        void emit("overlay-tooltip-data", {
          menu: true,
          provider: column.provider,
          accountId: column.accountId,
          placement: "above",
          x: cardCenterX,
          y: pos.y,
          cardCenterX,
          anchorY: pos.y,
          visible: true,
        });
      })
      .catch(() => {});
  };

  const openDashboard = (tab?: string, accountId?: string | null) => {
    isMenuOpenRef.current = false;
    void emit("overlay-tooltip-data", { visible: false }).catch(() => {});
    if (tab) {
      void emit(FOCUS_ACCOUNT_CARD_EVENT, { provider: tab, accountId }).catch(() => {});
    }
    invoke("show_dashboard", tab ? { tab } : {}).catch(() => {});
  };

  return (
    <div
      className={`taskbar-root taskbar-root--${data?.provider ?? "empty"}`}
      data-overlay-theme={overlayTheme}
      data-theme={appTheme}
    >
      <div
        ref={stripRef}
        className="taskbar-strip"
        data-columns={columns.length}
        data-visible-columns={visibleColumns.length}
        onWheel={handleWheel}
      >
        {hasPrev && (
          <TaskbarNavArrow
            direction="left"
            onClick={() => setStartIndex((prev) => Math.max(0, prev - 1))}
          />
        )}
        {visibleColumns.length ? (
          visibleColumns.map((column) => (
            <TaskbarColumn
              key={column.key}
              column={column}
              onHover={showTooltip}
              onLeave={hideTooltip}
              onMenu={showMenu}
              onOpen={(target) => openDashboard(target.provider, target.accountId)}
            />
          ))
        ) : (
          <button
            type="button"
            className="taskbar-empty"
            onClick={() => openDashboard()}
            data-tooltip="Open QuotaShift"
          >
            QuotaShift
          </button>
        )}
        {hasNext && (
          <TaskbarNavArrow
            direction="right"
            onClick={() =>
              setStartIndex((prev) =>
                Math.min(columns.length - MAX_VISIBLE_TASKBAR_ACCOUNTS, prev + 1),
              )
            }
          />
        )}
      </div>
    </div>
  );
};
