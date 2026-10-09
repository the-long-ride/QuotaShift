import type { OverlayAccountData, OverlaySingleBar } from "./overlay-types";
import { ClaudeAccountUsageStatus, ClaudeMonitorStatus } from "./types";
import { loadClaudePreferences } from "./claude-preferences";
import { buildClaudeGuardrailOverlayState } from "./claude-overlay-sync";
import { formatClaudeModelName } from "../claude/claude-formatters";
import { classifyClaudeTier } from "../claude/claude-tier-summary";
import {
  resetCreditsToOverlayFields,
  type ClaudeResetCredits,
} from "../claude/claude-reset-credits";
import { epochToIso } from "./reset-label";

export {
  buildAntigravityOverlayRows,
  buildAntigravityOverlayPayload,
  buildCodexOverlayPayload,
} from "./app-overlay-quota-builders";

export const buildClaudeOverlayPayload = (
  status: ClaudeMonitorStatus,
  prev: OverlayAccountData | null,
): OverlayAccountData => {
  const session = status.session;
  const preferences = loadClaudePreferences();
  const rawModel = session?.modelDisplayName || session?.modelId || "Claude Code";
  const modelLabel = formatClaudeModelName(rawModel);
  const projectDir =
    session?.projectDir ||
    session?.currentDir ||
    (status.localUsage ? "Local activity" : "Claude Code Monitor");

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

  const fiveReset = fivePct !== null ? epochToIso(session?.fiveHour?.resetsAt) : null;
  const weeklyReset = weeklyPct !== null ? epochToIso(session?.sevenDay?.resetsAt) : null;

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
    fiveHourResetAt:
      fivePct !== null ? fiveReset : reusePrev ? (prev?.fiveHourResetAt ?? null) : null,
    weeklyResetAt:
      weeklyPct !== null ? weeklyReset : reusePrev ? (prev?.weeklyResetAt ?? null) : null,
    singleBars: singleBars ?? (reusePrev ? prev?.singleBars : undefined),
    claudeGuardrails: buildClaudeGuardrailOverlayState(preferences),
    loading: !status.installed && !session && !status.localUsage,
  };
};

export const buildClaudeAccountOverlayPayload = (
  status: ClaudeAccountUsageStatus,
  prev: OverlayAccountData | null,
  resetCredits?: ClaudeResetCredits | null,
): OverlayAccountData => {
  const preferences = loadClaudePreferences();
  const account = status.account;
  const remaining = (used: number | null | undefined) =>
    used == null ? null : Math.max(0, Math.min(100, 100 - Math.round(used)));
  const fivePct = remaining(status.fiveHour?.usedPercentage);
  const weeklyPct = remaining(status.sevenDay?.usedPercentage);
  const reusePrev = prev?.provider === "claude" && prev.accountId === account.id;
  const fiveHourPercent = fivePct ?? (reusePrev ? (prev?.fiveHourPercent ?? null) : null);
  const weeklyPercent = weeklyPct ?? (reusePrev ? (prev?.weeklyPercent ?? null) : null);
  const fiveHourResetAt =
    fivePct !== null
      ? epochToIso(status.fiveHour?.resetsAt)
      : reusePrev
        ? (prev?.fiveHourResetAt ?? null)
        : null;
  const weeklyResetAt =
    weeklyPct !== null
      ? epochToIso(status.sevenDay?.resetsAt)
      : reusePrev
        ? (prev?.weeklyResetAt ?? null)
        : null;

  return {
    provider: "claude",
    accountId: account.id,
    label: account.profileName || account.email || "Claude Code",
    email: account.email || account.organizationName || account.configDir,
    avatarUrl: null,
    tier: classifyClaudeTier(account.subscriptionType || account.rateLimitTier),
    fiveHourPercent,
    weeklyPercent,
    fiveHourResetAt,
    weeklyResetAt,
    singleBars: [
      { label: "5H", percent: fiveHourPercent, resetAt: fiveHourResetAt },
      { label: "WK", percent: weeklyPercent, resetAt: weeklyResetAt },
    ],
    claudeGuardrails: buildClaudeGuardrailOverlayState(preferences),
    ...resetCreditsToOverlayFields(resetCredits),
    loading: false,
  };
};

export const buildTrackedClaudeOverlayPayload = ({
  trackedAccountId,
  accountStatuses,
  monitorStatus,
  prev,
  resetCredits,
}: {
  trackedAccountId: string | null;
  accountStatuses: ClaudeAccountUsageStatus[];
  monitorStatus: ClaudeMonitorStatus;
  prev: OverlayAccountData | null;
  resetCredits?: ClaudeResetCredits | null;
}): OverlayAccountData => {
  const trackedAccount =
    trackedAccountId && trackedAccountId !== "claude-local"
      ? accountStatuses.find((status) => status.account.id === trackedAccountId)
      : undefined;

  if (trackedAccount) {
    return buildClaudeAccountOverlayPayload(
      trackedAccount,
      prev?.provider === "claude" ? prev : null,
      resetCredits,
    );
  }

  if (trackedAccountId && trackedAccountId !== "claude-local") {
    const previousMatches = prev?.provider === "claude" && prev.accountId === trackedAccountId;
    return {
      provider: "claude",
      accountId: trackedAccountId,
      label: previousMatches ? prev.label : "Claude Code",
      email: previousMatches ? prev.email : "Loading monitored account",
      avatarUrl: null,
      tier: previousMatches ? prev.tier : "PRO",
      fiveHourPercent: previousMatches ? prev.fiveHourPercent : null,
      weeklyPercent: previousMatches ? prev.weeklyPercent : null,
      fiveHourResetAt: previousMatches ? (prev.fiveHourResetAt ?? null) : null,
      weeklyResetAt: previousMatches ? (prev.weeklyResetAt ?? null) : null,
      singleBars: previousMatches ? prev.singleBars : undefined,
      claudeGuardrails: buildClaudeOverlayPayload(monitorStatus, null).claudeGuardrails,
      loading: true,
    };
  }

  return buildClaudeOverlayPayload(monitorStatus, prev);
};
