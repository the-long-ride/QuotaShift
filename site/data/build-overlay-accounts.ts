import type { OverlayAccountData } from "../../src/utils/common/overlay-types";
import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  ClaudeAccountUsageStatus,
  CodexAccount,
  LocalAntigravitySession,
} from "../../src/utils/common/types";
import type { ClaudeResetCredits } from "../../src/utils/claude/claude-reset-credits";
import {
  buildAntigravityOverlayPayload,
  buildAntigravityOverlayRows,
  buildClaudeAccountOverlayPayload,
  buildCodexOverlayPayload,
} from "../../src/utils/common/overlay/app-overlay-helpers";
import { getEarliestExpiringCredit } from "../../src/utils/codex/codex-reset-credits";
import type { DemoCodexUsageCacheEntry } from "./demo-codex";
import { DEFAULT_DEMO_TRACKED_IDS, type DemoTrackedIds } from "../hooks/demo-coordinator-types";

export { DEFAULT_DEMO_TRACKED_IDS, type DemoTrackedIds };

export interface BuildDemoOverlayAccountsParams {
  trackedIds?: DemoTrackedIds;
  antigravityAccounts: AntigravityAccount[];
  antigravityUsageCache: Record<string, AntigravityUsageCacheEntry>;
  localAntigravitySession?: LocalAntigravitySession | null;
  codexAccounts: CodexAccount[];
  codexUsageCache: Record<string, DemoCodexUsageCacheEntry>;
  claudeAccountStatuses: ClaudeAccountUsageStatus[];
  claudeResetCredits?: Record<string, ClaudeResetCredits>;
}

export interface BuildDemoOverlayAccountsResult {
  overlayCards: OverlayAccountData[];
  primaryOverlayData: OverlayAccountData | null;
}

export function buildDemoOverlayAccounts({
  trackedIds = DEFAULT_DEMO_TRACKED_IDS,
  antigravityAccounts,
  antigravityUsageCache,
  localAntigravitySession,
  codexAccounts,
  codexUsageCache,
  claudeAccountStatuses,
  claudeResetCredits,
}: BuildDemoOverlayAccountsParams): BuildDemoOverlayAccountsResult {
  const overlayCards: OverlayAccountData[] = [];

  for (const id of trackedIds.antigravity) {
    const acc = antigravityAccounts.find((item) => item.id === id);
    if (!acc) continue;
    const cache = antigravityUsageCache[acc.id];
    const quotaRows = buildAntigravityOverlayRows(cache?.cloudQuotas ?? acc.cloudQuotas ?? []);
    overlayCards.push(
      buildAntigravityOverlayPayload(
        acc,
        quotaRows,
        null,
        localAntigravitySession,
        cache?.planTier ?? acc.lastPlan,
      ),
    );
  }

  for (const id of trackedIds.codex) {
    const acc = codexAccounts.find((item) => item.id === id);
    if (!acc) continue;
    const cache = codexUsageCache[acc.id];
    const payload = buildCodexOverlayPayload(acc, cache ?? {}, null);
    const earliest = getEarliestExpiringCredit(cache?.resetCredits?.credits);
    overlayCards.push({
      ...payload,
      resetCount: cache?.resetCredits?.available_count ?? payload.resetCount ?? null,
      resetNearestExpiresAt: earliest?.expires_at ?? null,
    });
  }

  for (const id of trackedIds.claude) {
    const status = claudeAccountStatuses.find((item) => item.account.id === id);
    if (!status) continue;
    overlayCards.push(
      buildClaudeAccountOverlayPayload(status, null, claudeResetCredits?.[id] ?? null),
    );
  }

  if (overlayCards.length === 0) {
    return { overlayCards, primaryOverlayData: null };
  }

  const [primary, ...extras] = overlayCards;
  const primaryOverlayData: OverlayAccountData =
    extras.length > 0 ? { ...primary, additionalAccounts: extras } : primary;

  return { overlayCards, primaryOverlayData };
}
