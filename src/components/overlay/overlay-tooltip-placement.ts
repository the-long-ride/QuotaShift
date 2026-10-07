import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import type { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { anchorMonitor, moveOntoMonitor } from "../taskbar/taskbar-monitor";
import type { OverlayTooltipPayload } from "./OverlayTooltipApp";
import { nextFrame } from "./overlay-tooltip-anchor";

/** Default width when the overlay card width is unknown; the text is centred inside. */
export const TEXT_TOOLTIP_WIDTH = 480;
export const TEXT_TOOLTIP_HEIGHT = 38;
/** Vertical breathing room (CSS px) added around a wrapped tooltip. */
const WRAP_PADDING = 8;

type TooltipWindow = ReturnType<typeof getCurrentWebviewWindow>;

/**
 * Shows a one-line tooltip centred on `cardCenterX`.
 * The window is as wide as the whole account card (`maxWidth`) and the text wraps inside it, so a
 * long hint is shown in full instead of being clipped. It is resized explicitly every time (after
 * a taskbar card or menu it is stale). The window is not
 * clamped to the monitor: shifting it would move the centred text. Height only grows for wrapped
 * text, symmetrically around the single-line centre, so one-line tooltips sit where they always did.
 * `isCurrent` turns false once a newer tooltip event arrived; a superseded placement stops before
 * it resizes, moves or shows the window, so two placements can never interleave.
 */
export async function placeTextTooltip(
  win: TooltipWindow,
  payload: OverlayTooltipPayload,
  uiScale: number,
  measure?: () => HTMLElement | null,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const centerX = payload.cardCenterX ?? payload.x;
  const monitor = await anchorMonitor(centerX, payload.y);
  if (!isCurrent()) return;
  await moveOntoMonitor(win, monitor);
  if (!isCurrent()) return;
  const scale = monitor?.scaleFactor ?? (window.devicePixelRatio || 1);
  const baseHeight = Math.round(TEXT_TOOLTIP_HEIGHT * uiScale * scale);
  const width = Math.max(1, Math.round(payload.maxWidth ?? TEXT_TOOLTIP_WIDTH * uiScale * scale));
  await win.setSize(new PhysicalSize(width, baseHeight));
  await nextFrame();
  if (!isCurrent()) return;
  const rect = measure?.()?.getBoundingClientRect();
  const dpr = window.devicePixelRatio || scale;
  const wanted = rect ? Math.ceil((rect.height + WRAP_PADDING) * dpr) : 0;
  const height = Math.max(baseHeight, wanted);
  if (height !== baseHeight) await win.setSize(new PhysicalSize(width, height));
  if (!isCurrent()) return;
  // The width was just set in physical px, so it is used as is: reading `outerSize` back can
  // still return the previous, wider size and would shift the centred text off the anchor.
  const targetX =
    typeof payload.cardCenterX === "number" ? Math.round(centerX - width / 2) : payload.x;
  const targetY = Math.round(payload.y - (height - baseHeight) / 2);
  await win.setPosition(new PhysicalPosition(targetX, targetY));
  if (!isCurrent()) return;
  await win.show();
}
