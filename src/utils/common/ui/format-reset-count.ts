export function formatResetCount(count: number): string {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return `${safeCount} reset(s)`;
}

export function formatRetryAfterTime(retryAfterAt?: number | null): string | null {
  if (typeof retryAfterAt !== "number" || !Number.isFinite(retryAfterAt) || retryAfterAt <= 0) {
    return null;
  }
  const date = new Date(retryAfterAt * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
