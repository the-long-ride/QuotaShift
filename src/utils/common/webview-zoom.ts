/**
 * WebView page zoom set in the main window (Ctrl +/- or Ctrl+wheel) can leak into the other app
 * windows, which share its origin. Their native size is computed from the monitor scale, so the
 * content has to be scaled back by this factor to stay one CSS px per native logical px.
 * Returns 1 when nothing leaked or a value is not usable.
 */
export const zoomCompensation = (devicePixelRatio: number, nativeScale: number): number => {
  const usable = (value: number) => Number.isFinite(value) && value > 0;
  if (!usable(devicePixelRatio) || !usable(nativeScale)) return 1;
  const factor = nativeScale / devicePixelRatio;
  return Math.abs(factor - 1) < 0.005 ? 1 : factor;
};
