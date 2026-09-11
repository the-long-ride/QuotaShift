/**
 * Format an ISO date string for quota reset display.
 * Shared by AntigravityTab and CodexTab.
 */
export function formatAbsoluteTime(isoDate: string): string {
  if (!isoDate || isoDate === "Exhausted" || isoDate === "Ready") return isoDate || "\u2014";
  const futureDate = new Date(isoDate);
  if (isNaN(futureDate.getTime())) return "\u2014";

  const ampm = futureDate.getHours() >= 12 ? "PM" : "AM";
  let hour12 = futureDate.getHours() % 12;
  hour12 = hour12 ? hour12 : 12;
  const minStr = String(futureDate.getMinutes()).padStart(2, "0");
  const timeStr = `${hour12}:${minStr} ${ampm}`;

  const now = new Date();
  const isCurrentDay =
    futureDate.getDate() === now.getDate() &&
    futureDate.getMonth() === now.getMonth() &&
    futureDate.getFullYear() === now.getFullYear();

  if (isCurrentDay) {
    return `Resets at: ${timeStr}`;
  }

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const month = MONTHS[futureDate.getMonth()];
  const day = futureDate.getDate();
  return `Resets at: ${month} ${day}, ${timeStr}`;
}
