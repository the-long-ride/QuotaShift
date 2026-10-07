import type { OverlayAccountData, OverlayClaudeGuardrails } from "./overlay-types";
import { accountInitial } from "./account-initial.js";
import { listOverlayAccounts } from "./overlay-extra-accounts.js";
import { resolveOverlayPlatformName } from "./overlay-tooltip.js";

/** Model-family logo shown instead of a text label (Antigravity rows). */
export type TaskbarLineIcon = "gemini" | "claude-openai" | null;

/** One taskbar text line: a short label (or family logo) and one or two percentages. */
export interface TaskbarLine {
  key: string;
  label: string;
  icon: TaskbarLineIcon;
  values: Array<number | null>;
}

export interface TaskbarMeter {
  label: string;
  percent: number | null;
}

/** One block of the hover card: a model family, or the account's own usage windows. */
export interface TaskbarSection {
  title: string | null;
  icon: TaskbarLineIcon;
  meters: TaskbarMeter[];
}

/** Everything the taskbar hover card shows; a smaller take on the expanded account card. */
export interface TaskbarTooltipDetails {
  provider: OverlayAccountData["provider"];
  accountId?: string | null;
  title: string;
  email: string;
  platform: string;
  tier: string | null;
  resetCount: number | null;
  loading: boolean;
  sections: TaskbarSection[];
  guardrails?: OverlayClaudeGuardrails | null;
}

export interface TaskbarColumn {
  key: string;
  accountId?: string | null;
  provider: OverlayAccountData["provider"];
  label: string;
  initial: string;
  email: string;
  avatarUrl: string | null;
  tier: string | null;
  lines: TaskbarLine[];
  details: TaskbarTooltipDetails;
  resetCount: number | null;
  loading: boolean;
}

export const MAX_TASKBAR_LINES = 2;

const finite = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Short window label as on the overlay bars: 5H, WK or MO. */
export function shortWindowLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("month")) return "MO";
  if (l.includes("5h") || l.includes("5-hour") || l.includes("5 hour")) return "5H";
  if (l.includes("week") || l === "wk") return "WK";
  return label.slice(0, 3).toUpperCase();
}

const familyIcon = (label: string): TaskbarLineIcon =>
  /gemini/i.test(label) ? "gemini" : "claude-openai";

export function buildTaskbarSections(card: OverlayAccountData): TaskbarSection[] {
  if (card.quotaRows?.length) {
    return card.quotaRows.map((row) => ({
      title: row.label,
      icon: familyIcon(row.label),
      meters: [
        { label: "5H", percent: finite(row.fiveHourPercent) },
        { label: "WK", percent: finite(row.weeklyPercent) },
      ],
    }));
  }
  if (card.singleBars?.length) {
    const meters = card.singleBars.map((bar) => ({
      label: shortWindowLabel(bar.label),
      percent: finite(bar.percent),
    }));
    return [{ title: null, icon: null, meters }];
  }
  const meters = [
    { label: "5H", percent: finite(card.fiveHourPercent) },
    { label: "WK", percent: finite(card.weeklyPercent) },
  ];
  return [{ title: null, icon: null, meters }];
}

/** Families become one line each ("5H%/WK%"); otherwise one line per usage window. */
export function buildTaskbarLines(sections: TaskbarSection[]): TaskbarLine[] {
  const families = sections.filter((section) => section.title !== null);
  if (families.length) {
    return families.slice(0, MAX_TASKBAR_LINES).map((section, index) => ({
      key: `${section.title}-${index}`,
      label: section.title ?? "",
      icon: section.icon,
      values: section.meters.map((meter) => meter.percent),
    }));
  }
  return sections
    .flatMap((section) => section.meters)
    .slice(0, MAX_TASKBAR_LINES)
    .map((meter, index) => ({
      key: `${meter.label}-${index}`,
      label: meter.label,
      icon: null,
      values: [meter.percent],
    }));
}

export function buildTaskbarColumns(
  payload: OverlayAccountData | null | undefined,
): TaskbarColumn[] {
  return listOverlayAccounts(payload).map((card, index) => {
    const label = card.label?.trim() || card.email?.trim() || "Account";
    const email = card.email?.trim() || "";
    const tier = card.tier?.trim() || null;
    const resetCount = finite(card.resetCount);
    const loading = Boolean(card.loading);
    const sections = buildTaskbarSections(card);
    return {
      key: card.accountId || `${card.provider}-${index}`,
      accountId: card.accountId ?? null,
      provider: card.provider,
      label,
      initial: accountInitial([label]),
      email,
      avatarUrl: card.avatarUrl || null,
      tier,
      lines: buildTaskbarLines(sections),
      details: {
        provider: card.provider,
        accountId: card.accountId ?? null,
        title: label,
        email,
        platform: resolveOverlayPlatformName(card.provider),
        tier,
        resetCount: resetCount !== null && resetCount > 0 ? resetCount : null,
        loading,
        sections,
        guardrails: card.claudeGuardrails ?? null,
      },
      resetCount,
      loading,
    };
  });
}

export function formatTaskbarPercent(percent: number | null): string {
  return percent === null ? "–" : `${Math.round(Math.max(0, Math.min(100, percent)))}%`;
}

export function formatTaskbarValues(values: Array<number | null>): string {
  return values.map(formatTaskbarPercent).join("/");
}

/** Plain-text summary (accessibility and fallback for the hover card). */
export function taskbarTooltipText(column: TaskbarColumn): string {
  const who =
    column.email && column.email !== column.label
      ? `${column.label} - ${column.email}`
      : column.label;
  const lines = column.lines.map((line) => `${line.label} ${formatTaskbarValues(line.values)}`);
  return [who, ...lines].join(" · ");
}
