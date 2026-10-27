export type UsageTone = "normal" | "warning" | "critical";

export function getUsageTone(percent: number | null | undefined): UsageTone {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return "normal";
  if (percent < 10) return "critical";
  if (percent < 20) return "warning";
  return "normal";
}
