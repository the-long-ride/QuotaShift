export interface OverlayBox {
  width: number;
  height: number;
}

/** CSS px kept around the card: overlay container padding plus sub-pixel border rounding. */
export const OVERLAY_MEASURE_SLACK = 6;

const isUsableBox = (box: OverlayBox): boolean =>
  Number.isFinite(box.width) && Number.isFinite(box.height) && box.width > 0 && box.height > 0;

/**
 * Converts the card's unzoomed CSS size (from `getComputedStyle`) into a native overlay
 * window size. The overlay container applies `zoom: scale`, so the rendered card is
 * `card * scale` logical px. Client rects are not used: inside a zoomed subtree the engine
 * reports the container and its children in different units. Unusable measurements keep
 * the fixed base `fallback`, and growth is capped at twice that fallback.
 */
export function resolveMeasuredOverlaySize({
  card,
  fallback,
  scale = 1,
}: {
  card: OverlayBox;
  fallback: OverlayBox;
  scale?: number;
}): OverlayBox {
  if (!isUsableBox(card) || !isUsableBox(fallback)) return { ...fallback };
  const zoom = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const slack = Math.ceil(OVERLAY_MEASURE_SLACK * zoom);
  return {
    width: Math.min(fallback.width * 2, Math.ceil(card.width * zoom) + slack),
    height: Math.min(fallback.height * 2, Math.ceil(card.height * zoom) + slack),
  };
}

/** Compensate when the WebView receives less CSS viewport than the native size requested. */
export function resolveViewportAdjustedOverlaySize({
  measured,
  applied,
  viewport,
}: {
  measured: OverlayBox;
  applied: OverlayBox | null;
  viewport: OverlayBox;
}): OverlayBox {
  if (!applied) return measured;

  const adjust = (content: number, requested: number, available: number): number => {
    if (!Number.isFinite(available) || available < requested / 2 || available >= requested) {
      return content;
    }
    return Math.ceil((content * requested) / available);
  };

  return {
    width: adjust(measured.width, applied.width, viewport.width),
    height: adjust(measured.height, applied.height, viewport.height),
  };
}
