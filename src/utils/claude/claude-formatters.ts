export const clampPercent = (value: number | null | undefined): number => {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

export const formatPercent = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `${Math.round(value * 10) / 10}%`;
};

export const formatTokens = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
};

export const formatDuration = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return "--";
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

export const formatReset = (epochSeconds: number | null | undefined): string => {
  if (epochSeconds == null || !Number.isFinite(epochSeconds)) return "Reset unavailable";
  const ms = epochSeconds > 10_000_000_000 ? epochSeconds : epochSeconds * 1000;
  return `Resets ${new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
};

export const formatCaptureTime = (epochMs: number): string => {
  if (!epochMs) return "Unknown";
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
};
