import type { OverlayAccountData, OverlaySingleBar, OverlayQuotaRow } from "./overlay-types";
import {
  AntigravityAccount,
  ClaudeAccountUsageStatus,
  ClaudeMonitorStatus,
  CodexAccount,
  LocalAntigravitySession,
} from "./types";
import { loadClaudePreferences } from "./claude-preferences";
import { buildClaudeGuardrailOverlayState } from "./claude-overlay-sync";
import { deobfuscate } from "../auth/auth";
import { normalizeCodexUsageWindows } from "../codex/codex-usage-windows";
import { formatClaudeModelName } from "../claude/claude-formatters";
import { classifyAntigravityTier } from "../antigravity/antigravity-tier-summary";
import { classifyClaudeTier } from "../claude/claude-tier-summary";
import {
  resetCreditsToOverlayFields,
  type ClaudeResetCredits,
} from "../claude/claude-reset-credits";
import { classifyCodexTier, isCodexAccountOAuth } from "../codex/codex-tier-summary";

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

  return {
    provider: "claude",
    accountId: account.id,
    label: account.profileName || account.email || "Claude Code",
    email: account.email || account.organizationName || account.configDir,
    avatarUrl: null,
    tier: classifyClaudeTier(account.subscriptionType || account.rateLimitTier),
    fiveHourPercent:
      fivePct !== null ? fivePct : reusePrev ? (prev?.fiveHourPercent ?? null) : null,
    weeklyPercent:
      weeklyPct !== null ? weeklyPct : reusePrev ? (prev?.weeklyPercent ?? null) : null,
    singleBars: [
      { label: "5H", percent: fivePct },
      { label: "WK", percent: weeklyPct },
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
      singleBars: previousMatches ? prev.singleBars : undefined,
      claudeGuardrails: buildClaudeOverlayPayload(monitorStatus, null).claudeGuardrails,
      loading: true,
    };
  }

  return buildClaudeOverlayPayload(monitorStatus, prev);
};

export const buildAntigravityOverlayRows = (cloudQuotas: any[]): OverlayQuotaRow[] => {
  const rows: OverlayQuotaRow[] = [];
  const gemini = cloudQuotas.find((q: any) => q.family === "gemini");
  const claudeOrOai = cloudQuotas.find((q: any) => q.family === "claude" || q.family === "open_ai");
  if (gemini) {
    rows.push({
      label: "Gemini",
      fiveHourPercent: gemini.fiveHourPercent ?? null,
      weeklyPercent: gemini.weeklyPercent ?? null,
    });
  }
  if (claudeOrOai) {
    rows.push({
      label: claudeOrOai.family === "open_ai" ? "OpenAI" : "Claude",
      fiveHourPercent: claudeOrOai.fiveHourPercent ?? null,
      weeklyPercent: claudeOrOai.weeklyPercent ?? null,
    });
  }
  return rows;
};

export const buildAntigravityOverlayPayload = (
  acc: AntigravityAccount | undefined,
  quotaRows: OverlayQuotaRow[],
  prev: OverlayAccountData | null,
  localSession?: Partial<LocalAntigravitySession> | null,
  detectedPlan?: string | null,
): OverlayAccountData => {
  const reuse = prev && prev.provider === "antigravity";
  const email = acc?.email || localSession?.email || "Antigravity";
  const plan = detectedPlan || acc?.lastPlan || localSession?.planTier;
  const avatar = acc?.profileUrl || localSession?.capturedAccount?.profileUrl;
  return {
    provider: "antigravity",
    accountId: acc?.id ?? "local",
    label: acc?.label || (localSession ? "Local Session" : email),
    email,
    avatarUrl: avatar ? deobfuscate(avatar) : null,
    tier: classifyAntigravityTier(plan),
    quotaRows,
    fiveHourPercent:
      quotaRows[0]?.fiveHourPercent ?? (reuse ? (prev?.fiveHourPercent ?? null) : null),
    weeklyPercent: quotaRows[0]?.weeklyPercent ?? (reuse ? (prev?.weeklyPercent ?? null) : null),
    loading: !acc && !localSession,
  };
};

export const buildCodexOverlayPayload = (
  acc: CodexAccount | undefined,
  cache: any,
  prev: OverlayAccountData | null,
): OverlayAccountData => {
  const windows = normalizeCodexUsageWindows(cache.rate_limit);
  const reuse = prev && prev.provider === "codex";
  const rawTier = cache?.planName ?? acc?.lastPlan ?? "Free";
  const tier = classifyCodexTier(rawTier, acc ? isCodexAccountOAuth(acc, cache) : true);
  return {
    provider: "codex",
    accountId: acc?.id ?? "codex",
    label: acc?.label || acc?.email || "Codex",
    email: acc?.email || "ChatGPT",
    avatarUrl: acc?.profileUrl ? deobfuscate(acc.profileUrl) : null,
    tier,
    fiveHourPercent:
      (windows.find((w: any) => w.durationMinutes === 300) as any)?.remainingPercent ??
      (reuse ? (prev?.fiveHourPercent ?? null) : null),
    weeklyPercent:
      (windows.find((w: any) => w.durationMinutes === 10080) as any)?.remainingPercent ??
      (reuse ? (prev?.weeklyPercent ?? null) : null),
    singleBars: windows.map((w: any) => {
      const l = (w.label || "").toLowerCase();
      const lbl = l.includes("month")
        ? "MO"
        : l.includes("5h")
          ? "5H"
          : l.includes("week")
            ? "WK"
            : w.label;
      return { label: lbl, percent: Math.round(w.remainingPercent ?? 100 - w.usedPercent) };
    }),
    loading: !cache,
    resetCount: cache?.rate_limit?.reset_credits?.available_count ?? null,
  };
};
