export interface OverlayNativeSizeInput {
  baseWidth: number;
  baseHeight: number;
  scale: number;
}

export interface OverlayNativeSize {
  width: number;
  height: number;
}

export const calculateOverlayNativeSize = ({
  baseWidth,
  baseHeight,
  scale,
}: OverlayNativeSizeInput): OverlayNativeSize => {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    width: Math.max(1, Math.round(baseWidth * safeScale)),
    height: Math.max(1, Math.round(baseHeight * safeScale)),
  };
};
