import { aggregateCloudQuotasIntoPools } from "../antigravity/antigravity-quota.js";
import type { AntigravityModelQuota, QuotaData } from "./types.js";
import type { OverlayAccountData, OverlayQuotaRow } from "./overlay-types";
import { AntigravityAccount, CodexAccount, LocalAntigravitySession } from "./types";
import { deobfuscate } from "../auth/auth";
import { normalizeCodexUsageWindows } from "../codex/codex-usage-windows";
import { classifyAntigravityTier } from "../antigravity/antigravity-tier-summary";
import { classifyCodexTier, isCodexAccountOAuth } from "../codex/codex-tier-summary";
import { epochToIso } from "./reset-label";

export const buildAntigravityOverlayRows = (
  cloudQuotas: readonly (AntigravityModelQuota | QuotaData)[],
): OverlayQuotaRow[] =>
  aggregateCloudQuotasIntoPools(cloudQuotas).map((pool) => ({
    label: pool.model === "Gemini Models" ? "Gemini" : "Claude & OpenAI",
    fiveHourPercent: pool.fiveHourPercent ?? null,
    weeklyPercent: pool.weeklyPercent ?? null,
    fiveHourResetAt: pool.fiveHourReset ?? null,
    weeklyResetAt: pool.weeklyReset ?? null,
    fiveHourDisabled: Boolean(pool.fiveHourDisabled),
    weeklyDisabled: Boolean(pool.weeklyDisabled),
  }));

export const buildAntigravityOverlayPayload = (
  acc: AntigravityAccount | undefined,
  quotaRows: OverlayQuotaRow[],
  _prev: OverlayAccountData | null,
  localSession?: Partial<LocalAntigravitySession> | null,
  detectedPlan?: string | null,
): OverlayAccountData => {
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
    fiveHourPercent: quotaRows[0]?.fiveHourPercent ?? null,
    weeklyPercent: quotaRows[0]?.weeklyPercent ?? null,
    fiveHourResetAt: quotaRows[0]?.fiveHourResetAt ?? null,
    weeklyResetAt: quotaRows[0]?.weeklyResetAt ?? null,
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
    fiveHourResetAt: epochToIso(
      (windows.find((w: any) => w.durationMinutes === 300) as any)?.resetAt,
    ),
    weeklyResetAt: epochToIso(
      (windows.find((w: any) => w.durationMinutes === 10080) as any)?.resetAt,
    ),
    singleBars: windows.map((w: any) => {
      const l = (w.label || "").toLowerCase();
      const lbl = l.includes("month")
        ? "MO"
        : l.includes("5h")
          ? "5H"
          : l.includes("week")
            ? "WK"
            : w.label;
      return {
        label: lbl,
        percent: Math.round(w.remainingPercent ?? 100 - w.usedPercent),
        resetAt: epochToIso(w.resetAt),
      };
    }),
    loading: !cache,
    resetCount: cache?.rate_limit?.reset_credits?.available_count ?? null,
  };
};
