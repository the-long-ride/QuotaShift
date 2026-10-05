import type { OverlayAccountData } from "../../components/overlay/OverlayApp";
import type {
  AntigravityUsageCacheEntry,
  UseAppUsageAndOverlayParams,
} from "./useAppUsageAndOverlay.types";
import { buildTrackedClaudeOverlayPayload } from "../../utils/common/app-overlay-helpers";
import { buildActiveOverlayData } from "../../utils/common/overlay-builder";
import { attachAdditionalAccounts } from "../../utils/common/overlay-extra-accounts";
import type { TrackedEntry } from "../../utils/common/tracked-accounts";
import type { useClaudeResetCredits } from "../claude/useClaudeResetCredits";
import type { useCodexUsageFetcher } from "../codex/useCodexUsageFetcher";

export interface TrackedExtrasContext {
  params: UseAppUsageAndOverlayParams;
  antigravityUsageCache: Record<string, AntigravityUsageCacheEntry>;
  codexUsageCache: ReturnType<typeof useCodexUsageFetcher>["codexUsageCache"];
  resetCreditsByAccountId: ReturnType<typeof useClaudeResetCredits>["resetCreditsByAccountId"];
}

/** Builds a card for each other tracked account, from any provider (max 3 cards total). */
export function attachTrackedExtras(
  payload: OverlayAccountData,
  entries: TrackedEntry[],
  ctx: TrackedExtrasContext,
): OverlayAccountData {
  const { params, antigravityUsageCache, codexUsageCache, resetCreditsByAccountId } = ctx;
  return attachAdditionalAccounts(payload, entries, ({ provider, id }) =>
    provider === "claude"
      ? buildTrackedClaudeOverlayPayload({
          trackedAccountId: id,
          accountStatuses: params.claudeAccountStatuses,
          monitorStatus: params.claudeMonitorStatus,
          prev: null,
          resetCredits: resetCreditsByAccountId[id] ?? null,
        })
      : buildActiveOverlayData({
          ...params,
          savedTrackedProvider: provider,
          savedTrackedAccountId: id,
          isCodexTracked: provider === "codex",
          antigravityUsageCache,
          codexUsageCache,
          localAntigravitySession: params.localAntigravitySession,
          prevOverlayData: null,
        }).payload,
  );
}
