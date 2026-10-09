import type { OverlayAccountData, OverlayQuotaRow } from "./overlay-types";
import { AntigravityAccount, CodexAccount, LocalAntigravitySession } from "./types";
import { deobfuscate } from "../auth/auth";
import { normalizeCodexUsageWindows } from "../codex/codex-usage-windows";
import { classifyAntigravityTier } from "../antigravity/antigravity-tier-summary";
import { classifyCodexTier, isCodexAccountOAuth } from "../codex/codex-tier-summary";
import { epochToIso } from "./reset-label";

export const buildAntigravityOverlayRows = (cloudQuotas: any[]): OverlayQuotaRow[] => {
  const rows: OverlayQuotaRow[] = [];
  const gemini = cloudQuotas.find((q: any) => q.family === "gemini");
  const claudeOrOai = cloudQuotas.find((q: any) => q.family === "claude" || q.family === "open_ai");
  if (gemini) {
    rows.push({
      label: "Gemini",
      fiveHourPercent: gemini.fiveHourPercent ?? null,
      weeklyPercent: gemini.weeklyPercent ?? null,
      fiveHourResetAt: gemini.fiveHourReset ?? null,
      weeklyResetAt: gemini.weeklyReset ?? null,
      fiveHourDisabled: Boolean(gemini.fiveHourDisabled),
      weeklyDisabled: Boolean(gemini.weeklyDisabled),
    });
  }
  if (claudeOrOai) {
    rows.push({
      label: claudeOrOai.family === "open_ai" ? "OpenAI" : "Claude",
      fiveHourPercent: claudeOrOai.fiveHourPercent ?? null,
      weeklyPercent: claudeOrOai.weeklyPercent ?? null,
      fiveHourResetAt: claudeOrOai.fiveHourReset ?? null,
      weeklyResetAt: claudeOrOai.weeklyReset ?? null,
      fiveHourDisabled: Boolean(claudeOrOai.fiveHourDisabled),
      weeklyDisabled: Boolean(claudeOrOai.weeklyDisabled),
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
