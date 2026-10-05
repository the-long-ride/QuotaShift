import type { OverlayAccountData } from "../../components/overlay/OverlayApp";
import type {
  AntigravityUsageCacheEntry,
  UseAppUsageAndOverlayParams,
} from "./useAppUsageAndOverlay.types";
import { buildTrackedClaudeOverlayPayload } from "../../utils/common/app-overlay-helpers";
import { buildActiveOverlayData } from "../../utils/common/overlay-builder";
import { attachAdditionalAccounts } from "../../utils/common/overlay-extra-accounts";
import type { useClaudeResetCredits } from "../claude/useClaudeResetCredits";
import type { useCodexUsageFetcher } from "../codex/useCodexUsageFetcher";

export interface TrackedExtrasContext {
  params: UseAppUsageAndOverlayParams;
  antigravityUsageCache: Record<string, AntigravityUsageCacheEntry>;
  codexUsageCache: ReturnType<typeof useCodexUsageFetcher>["codexUsageCache"];
  resetCreditsByAccountId: ReturnType<typeof useClaudeResetCredits>["resetCreditsByAccountId"];
}

/** Builds a card for each extra tracked account of the shown provider (max 3 cards total). */
export function attachTrackedExtras(
  payload: OverlayAccountData,
  ids: string[],
  ctx: TrackedExtrasContext,
): OverlayAccountData {
  const { params, antigravityUsageCache, codexUsageCache, resetCreditsByAccountId } = ctx;
  const shownProvider = payload.provider;
  return attachAdditionalAccounts(payload, ids, (id) =>
    shownProvider === "claude"
      ? buildTrackedClaudeOverlayPayload({
          trackedAccountId: id,
          accountStatuses: params.claudeAccountStatuses,
          monitorStatus: params.claudeMonitorStatus,
          prev: null,
          resetCredits: resetCreditsByAccountId[id] ?? null,
        })
      : buildActiveOverlayData({
          ...params,
          savedTrackedProvider: shownProvider,
          savedTrackedAccountId: id,
          isCodexTracked: shownProvider === "codex",
          antigravityUsageCache,
          codexUsageCache,
          localAntigravitySession: params.localAntigravitySession,
          prevOverlayData: null,
        }).payload,
  );
}
