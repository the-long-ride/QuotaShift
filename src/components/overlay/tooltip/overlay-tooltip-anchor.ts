import type { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export interface HoveredCardAnchor {
  /** Physical px x of the hovered card's centre. */
  centerX: number;
  /** Physical px width of the hovered card. */
  width: number;
}

export interface SettledOverlayAnchor {
  position: { x: number; y: number };
  size: { width: number; height: number };
  anchor: HoveredCardAnchor;
}

type OverlayWindow = ReturnType<typeof getCurrentWebviewWindow>;

/** Next paint, with a timer fallback so a throttled window cannot stall the tooltip. */
export const nextFrame = () =>
  new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 50);
    requestAnimationFrame(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });

/**
 * Centre and width of the hovered account card in physical px. The overlay window can be wider
 * than the cards (e.g. the pagination rail), so the card's own rect is used; client rects are
 * post-zoom, so physical px = rect * (window width / viewport width).
 */
export function hoveredCardAnchor(
  container: HTMLElement | null,
  cardIndex: number,
  windowX: number,
  windowWidth: number,
): HoveredCardAnchor {
  const slot = container?.querySelector<HTMLElement>(`[data-overlay-card-index="${cardIndex}"]`);
  const rect = slot?.getBoundingClientRect();
  if (!rect) return { centerX: windowX + windowWidth / 2, width: windowWidth };
  const pxPerCss = windowWidth / Math.max(1, window.innerWidth);
  return {
    centerX: windowX + (rect.left + rect.width / 2) * pxPerCss,
    width: rect.width * pxPerCss,
  };
}

async function snapshot(
  win: OverlayWindow,
  container: HTMLElement | null,
  cardIndex: number,
): Promise<SettledOverlayAnchor> {
  const [position, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
  const anchor = hoveredCardAnchor(container, cardIndex, position.x, size.width);
  return {
    position: { x: position.x, y: position.y },
    size: { width: size.width, height: size.height },
    anchor,
  };
}

const snapshotKey = ({ position, size, anchor }: SettledOverlayAnchor) =>
  [
    position.x,
    position.y,
    size.width,
    size.height,
    Math.round(anchor.centerX * 10),
    Math.round(anchor.width * 10),
  ].join(",");

/**
 * Reads the hovered card's anchor only once the overlay has finished laying out. The window is
 * resized asynchronously after the cards (and the paging arrows) render, and `innerWidth` lags
 * behind the native size, so a single read can pair a stale viewport with a new window. The
 * window geometry and the card rect must be identical on two consecutive frames and the viewport
 * must agree with the native width before the anchor is trusted.
 */
export async function settledCardAnchor(
  win: OverlayWindow,
  container: HTMLElement | null,
  cardIndex: number,
  maxFrames = 12,
): Promise<SettledOverlayAnchor> {
  let previous: SettledOverlayAnchor | null = null;
  for (let frame = 0; frame < maxFrames; frame += 1) {
    await nextFrame();
    const current = await snapshot(win, container, cardIndex);
    const viewportMatches =
      Math.abs(window.innerWidth * (window.devicePixelRatio || 1) - current.size.width) <= 2;
    if (previous && viewportMatches && snapshotKey(previous) === snapshotKey(current)) {
      return current;
    }
    previous = current;
  }
  return previous as SettledOverlayAnchor;
}
