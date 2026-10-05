import type { OverlayAccountData } from "./overlay-types";
import { listOverlayAccounts } from "./overlay-extra-accounts.js";

export interface TaskbarBar {
  label: string;
  percent: number | null;
}

export interface TaskbarColumn {
  key: string;
  provider: OverlayAccountData["provider"];
  label: string;
  initial: string;
  email: string;
  avatarUrl: string | null;
  bars: TaskbarBar[];
  resetCount: number | null;
  loading: boolean;
}

export const MAX_TASKBAR_BARS = 2;

const finite = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Tightest (lowest remaining) of a row's 5-hour and weekly windows. */
const tightest = (a: number | null | undefined, b: number | null | undefined): number | null => {
  const values = [finite(a), finite(b)].filter((v): v is number => v !== null);
  return values.length ? Math.min(...values) : null;
};

export function buildTaskbarBars(card: OverlayAccountData): TaskbarBar[] {
  if (card.quotaRows?.length) {
    return card.quotaRows.slice(0, MAX_TASKBAR_BARS).map((row) => ({
      label: row.label,
      percent: tightest(row.fiveHourPercent, row.weeklyPercent),
    }));
  }
  if (card.singleBars?.length) {
    return card.singleBars
      .slice(0, MAX_TASKBAR_BARS)
      .map((bar) => ({ label: bar.label, percent: finite(bar.percent) }));
  }
  return [
    { label: "5H", percent: finite(card.fiveHourPercent) },
    { label: "WK", percent: finite(card.weeklyPercent) },
  ];
}

export function buildTaskbarColumns(
  payload: OverlayAccountData | null | undefined,
): TaskbarColumn[] {
  return listOverlayAccounts(payload).map((card, index) => {
    const label = card.label?.trim() || card.email?.trim() || "Account";
    return {
      key: card.accountId || `${card.provider}-${index}`,
      provider: card.provider,
      label,
      initial: label.charAt(0).toUpperCase(),
      email: card.email?.trim() || "",
      avatarUrl: card.avatarUrl || null,
      bars: buildTaskbarBars(card),
      resetCount: finite(card.resetCount),
      loading: Boolean(card.loading),
    };
  });
}

export function formatTaskbarPercent(percent: number | null): string {
  return percent === null ? "–" : `${Math.round(Math.max(0, Math.min(100, percent)))}%`;
}

export function taskbarTooltipText(column: TaskbarColumn): string {
  const who =
    column.email && column.email !== column.label
      ? `${column.label} - ${column.email}`
      : column.label;
  const bars = column.bars.map((bar) => `${bar.label} ${formatTaskbarPercent(bar.percent)}`);
  return [who, ...bars].join(" · ");
}
