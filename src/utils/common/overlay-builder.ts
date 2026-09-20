import type { OverlayAccountData, OverlayQuotaRow } from "./overlay-types";
import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  CodexAccount,
  FullStatus,
  LocalAntigravitySession,
} from "./types";
import {
  buildAntigravityOverlayPayload,
  buildAntigravityOverlayRows,
  buildCodexOverlayPayload,
} from "./app-overlay-helpers";

export interface BuildActiveOverlayDataParams {
  savedTrackedProvider: string | null;
  savedTrackedAccountId: string | null;
  antigravityAccounts: AntigravityAccount[];
  codexAccounts: CodexAccount[];
  activeAntigravityId: string | null;
  activeCodexId: string | null;
  antigravityUsageCache: Record<string, AntigravityUsageCacheEntry>;
  codexUsageCache: Record<string, any>;
  lastFullStatus: FullStatus | null;
  localAntigravitySession?: LocalAntigravitySession | null;
  prevOverlayData: OverlayAccountData | null;
  isCodexTracked?: boolean;
}

export interface BuildActiveOverlayDataResult {
  payload: OverlayAccountData;
  syncIdentity?: {
    provider: "antigravity" | "codex";
    accountId: string;
  };
}

export function buildActiveOverlayData({
  savedTrackedProvider,
  savedTrackedAccountId,
  antigravityAccounts,
  codexAccounts,
  activeAntigravityId,
  activeCodexId,
  antigravityUsageCache,
  codexUsageCache,
  lastFullStatus,
  localAntigravitySession,
  prevOverlayData,
  isCodexTracked: customIsCodexTracked,
}: BuildActiveOverlayDataParams): BuildActiveOverlayDataResult {
  const effectiveAccountId = savedTrackedAccountId;

  const isCodexTracked =
    customIsCodexTracked ??
    (savedTrackedProvider === "codex" ||
      (savedTrackedProvider !== "antigravity" && Boolean(lastFullStatus?.monitoredCodex)));

  if (!isCodexTracked) {
    const isExplicitLocal =
      effectiveAccountId === "local" || effectiveAccountId === "local-antigravity-session";
    const acc = !isExplicitLocal
      ? ((effectiveAccountId
          ? antigravityAccounts.find((a) => a.id === effectiveAccountId)
          : null) ??
        antigravityAccounts.find((a) => a.id === activeAntigravityId) ??
        antigravityAccounts[0])
      : undefined;

    const syncIdentity =
      acc && savedTrackedProvider === "antigravity"
        ? { provider: "antigravity" as const, accountId: acc.id }
        : undefined;

    const cloudQuotas =
      (acc && antigravityUsageCache[acc.id]?.cloudQuotas) ||
      acc?.cloudQuotas ||
      localAntigravitySession?.quotas ||
      lastFullStatus?.quotas ||
      [];
    const quotaRows: OverlayQuotaRow[] = buildAntigravityOverlayRows(cloudQuotas);
    const payload = buildAntigravityOverlayPayload(
      acc,
      quotaRows,
      prevOverlayData && prevOverlayData.provider === "antigravity" ? prevOverlayData : null,
      localAntigravitySession,
      acc ? antigravityUsageCache[acc.id]?.planTier : localAntigravitySession?.planTier,
    );
    if (acc && antigravityUsageCache[acc.id]?.loading !== undefined) {
      payload.loading = antigravityUsageCache[acc.id].loading;
    }
    return { payload, syncIdentity };
  }

  const acc =
    (effectiveAccountId ? codexAccounts.find((a) => a.id === effectiveAccountId) : null) ??
    codexAccounts.find((a) => a.id === activeCodexId) ??
    codexAccounts[0];

  const syncIdentity = acc ? { provider: "codex" as const, accountId: acc.id } : undefined;
  const cache = (acc ? codexUsageCache[acc.id] : null) || ({} as any);
  const payload = buildCodexOverlayPayload(
    acc,
    cache,
    prevOverlayData && prevOverlayData.provider === "codex" ? prevOverlayData : null,
  );
  return { payload, syncIdentity };
}

export function readPreviousOverlayData(): OverlayAccountData | null {
  let prevOverlayData: OverlayAccountData | null = null;
  try {
    const raw = localStorage.getItem("quotashift_overlay_data");
    if (raw) prevOverlayData = JSON.parse(raw);
  } catch {}
  return prevOverlayData;
}
