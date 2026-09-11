export interface CodexResetCreditItem {
  id?: string;
  reset_type?: string;
  is_supported_by_plan?: boolean;
  status?: string;
  granted_at?: string;
  expires_at?: string;
  redeem_started_at?: string | null;
  redeemed_at?: string | null;
  title?: string;
  description?: string;
}

export interface CodexResetCreditsData {
  available_count?: number;
  total_earned_count?: number;
  credits?: CodexResetCreditItem[];
  immediate_reset_purchase_eligible?: boolean;
  history_enabled?: boolean;
}

export function formatResetTimeRemaining(
  expiresAt: string | number | undefined,
  nowMs: number = Date.now()
): string {
  if (!expiresAt) return "N/A";
  const expireMs =
    typeof expiresAt === "number"
      ? expiresAt < 1e11
        ? expiresAt * 1000
        : expiresAt
      : new Date(expiresAt).getTime();

  if (isNaN(expireMs)) return "N/A";
  const diff = expireMs - nowMs;
  if (diff <= 0) return "Expired";

  const totalMinutes = Math.floor(diff / (1000 * 60));
  const totalHours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h left` : `${days}d left`;
  }
  if (totalHours > 0) {
    return `${totalHours}h ${minutes}m left`;
  }
  return `${Math.max(1, minutes)}m left`;
}

export function formatResetDatePair(isoString: string | undefined): { utc: string; local: string } {
  if (!isoString) return { utc: "N/A", local: "N/A" };
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return { utc: String(isoString), local: String(isoString) };

  const utcStr = d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  const localStr = d.toLocaleString();
  return { utc: utcStr, local: localStr };
}

export function getEarliestExpiringCredit(
  credits: CodexResetCreditItem[] | undefined
): CodexResetCreditItem | null {
  if (!credits || credits.length === 0) return null;
  const available = credits.filter((c) => (c.status || "available") === "available" && c.expires_at);
  if (available.length === 0) return credits[0] || null;

  return available.reduce((earliest, curr) => {
    const earliestTime = earliest.expires_at ? new Date(earliest.expires_at).getTime() : Infinity;
    const currTime = curr.expires_at ? new Date(curr.expires_at).getTime() : Infinity;
    return currTime < earliestTime ? curr : earliest;
  }, available[0]);
}

export function formatResetCreditsSummary(data: CodexResetCreditsData | null | undefined): string {
  if (!data) return "Click to load";
  const count = data.available_count ?? data.credits?.length ?? 0;
  if (count === 0) return "0 resets";

  const earliest = getEarliestExpiringCredit(data.credits);
  if (earliest && earliest.expires_at) {
    const remain = formatResetTimeRemaining(earliest.expires_at);
    return `${count} reset · ${remain}`;
  }
  return `${count} reset${count > 1 ? "s" : ""}`;
}

export function buildResetCreditsTooltip(data: CodexResetCreditsData | null | undefined): string {
  if (!data) return "Rate-limit reset credits not loaded yet";
  const count = data.available_count ?? data.credits?.length ?? 0;
  const credits = data.credits || [];
  if (credits.length === 0) {
    return `Available resets: ${count}`;
  }

  const lines: string[] = [`Available resets: ${count}`];
  credits.forEach((c, idx) => {
    const title = c.title || "Rate limit reset";
    const status = c.status || "available";
    const expires = formatResetDatePair(c.expires_at);
    const granted = formatResetDatePair(c.granted_at);
    const remain = formatResetTimeRemaining(c.expires_at);

    lines.push(
      `[#${idx + 1}] ${title} (${status})\n` +
      `  • Remaining: ${remain}\n` +
      `  • Expires: ${expires.local} (UTC: ${expires.utc})\n` +
      `  • Granted: ${granted.local} (UTC: ${granted.utc})`
    );
  });

  return lines.join("\n\n");
}
