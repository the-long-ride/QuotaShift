import type { OverlayAccountData, OverlaySingleBar, OverlayQuotaRow } from "./overlay-types";
import { AntigravityAccount, ClaudeMonitorStatus } from "./types";
import { deobfuscate } from "../auth/auth";

export const formatClaudeModelName = (name: string | null | undefined): string => {
  if (!name) return "Claude";
  if (name === "claude-sonnet-5") return "Claude Sonnet  5";
  return name.replace(/claude-sonnet-5/g, "Claude Sonnet  5");
};

export const buildClaudeOverlayPayload = (
  status: ClaudeMonitorStatus,
  prev: OverlayAccountData | null,
): OverlayAccountData => {
  const session = status.session;
  const rawModel = session?.modelDisplayName || session?.modelId || "Claude";
  const modelLabel = formatClaudeModelName(rawModel);
  const projectDir =
    session?.projectDir ||
    session?.currentDir ||
    (status.localUsage ? "Local activity" : "Claude Monitor");

  let fivePct: number | null = null;
  let weeklyPct: number | null = null;
  let singleBars: OverlaySingleBar[] | undefined;

  if (session?.fiveHour || session?.sevenDay) {
    if (session.fiveHour?.usedPercentage != null) {
      fivePct = Math.max(0, 100 - Math.round(session.fiveHour.usedPercentage));
    }
    if (session.sevenDay?.usedPercentage != null) {
      weeklyPct = Math.max(0, 100 - Math.round(session.sevenDay.usedPercentage));
    }
  } else if (
    session?.contextUsedPercentage != null ||
    session?.contextRemainingPercentage != null
  ) {
    const rem =
      session.contextRemainingPercentage != null
        ? Math.round(session.contextRemainingPercentage)
        : Math.max(0, 100 - Math.round(session.contextUsedPercentage!));
    singleBars = [{ label: "Ctx", percent: rem }];
  }

  const reusePrev = prev && prev.provider === "claude";
  return {
    provider: "claude",
    accountId: "claude-local",
    label: modelLabel,
    email: projectDir,
    avatarUrl: null,
    tier: "PRO",
    fiveHourPercent:
      fivePct !== null ? fivePct : reusePrev ? (prev?.fiveHourPercent ?? null) : null,
    weeklyPercent:
      weeklyPct !== null ? weeklyPct : reusePrev ? (prev?.weeklyPercent ?? null) : null,
    singleBars: singleBars ?? (reusePrev ? prev?.singleBars : undefined),
    loading: !status.installed && !session && !status.localUsage,
  };
};

export const buildAntigravityOverlayPayload = (
  acc: AntigravityAccount | undefined,
  quotaRows: OverlayQuotaRow[],
  prev: OverlayAccountData | null,
): OverlayAccountData => {
  const reuse = prev && prev.provider === "antigravity";
  const email = acc?.email || "Antigravity";
  return {
    provider: "antigravity",
    accountId: acc?.id ?? "local",
    label: acc?.label || email,
    email,
    avatarUrl: acc?.profileUrl ? deobfuscate(acc.profileUrl) : null,
    tier: acc?.lastPlan ? (acc.lastPlan.toUpperCase().includes("PRO") ? "PRO" : "FREE") : "PRO",
    quotaRows,
    fiveHourPercent:
      quotaRows[0]?.fiveHourPercent ?? (reuse ? (prev?.fiveHourPercent ?? null) : null),
    weeklyPercent: quotaRows[0]?.weeklyPercent ?? (reuse ? (prev?.weeklyPercent ?? null) : null),
    loading: !acc,
  };
};
