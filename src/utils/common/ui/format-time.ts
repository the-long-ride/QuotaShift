/** Format an ISO reset date as a compact local 24-hour label. */
export function formatAbsoluteTime(isoDate: string, now: Date = new Date()): string {
  if (!isoDate || isoDate === "Exhausted" || isoDate === "Ready") return isoDate || "—";
  const futureDate = new Date(isoDate);
  if (isNaN(futureDate.getTime())) return "—";

  const timeStr = `${String(futureDate.getHours()).padStart(2, "0")}:${String(
    futureDate.getMinutes(),
  ).padStart(2, "0")}`;

  const isCurrentDay =
    futureDate.getDate() === now.getDate() &&
    futureDate.getMonth() === now.getMonth() &&
    futureDate.getFullYear() === now.getFullYear();
  if (isCurrentDay) return timeStr;

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const isTomorrow =
    futureDate.getDate() === tomorrow.getDate() &&
    futureDate.getMonth() === tomorrow.getMonth() &&
    futureDate.getFullYear() === tomorrow.getFullYear();
  if (isTomorrow) return `Tomorrow ${timeStr}`;

  const month = futureDate.toLocaleString("en", { month: "short" });
  return `${month} ${futureDate.getDate()}, ${timeStr}`;
}

export function formatUsageLimitTooltip(label: string, resetLabel: string): string {
  const reset = resetLabel?.trim() || "Unavailable";
  if (reset === "Ready") return `${label} usage limit - ready now`;
  if (reset === "Disabled") return `${label} usage limit - disabled`;
  if (reset === "Unavailable" || reset === "Reset unavailable" || reset === "—") {
    return `${label} usage limit - reset unavailable`;
  }
  return `${label} usage limit - reset at ${reset}`;
}
