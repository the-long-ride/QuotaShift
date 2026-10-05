import type {
  AntigravityAccount,
  CodexAccount,
  UseAppUsageAndOverlayParams,
} from "./useAppUsageAndOverlay.types";
import type { useClaudeResetCredits } from "../claude/useClaudeResetCredits";
import type { useCodexUsageFetcher } from "../codex/useCodexUsageFetcher";

export interface TrackedRefreshDeps {
  params: UseAppUsageAndOverlayParams;
  persistedTrackedProviderRef: { current: string | null };
  trackedAccountIdRef: { current: string | null };
  antigravityAccountsRef: { current: AntigravityAccount[] };
  codexAccountsRef: { current: CodexAccount[] };
  fetchAccountUsage: ReturnType<typeof useCodexUsageFetcher>["fetchAccountUsage"];
  refreshResetCredits: ReturnType<typeof useClaudeResetCredits>["refreshResetCredits"];
  publishOverlayUpdate: () => void;
}

/** Overlay "refresh" menu: refreshes only the tracked account, never a full multi-account sweep. */
export function createRefreshTrackedAccountOnly(deps: TrackedRefreshDeps) {
  const { params, persistedTrackedProviderRef, trackedAccountIdRef } = deps;
  const { antigravityAccountsRef, codexAccountsRef, fetchAccountUsage } = deps;
  const refreshTrackedAccountOnly = async (payload: any) => {
    const provider = payload?.provider || persistedTrackedProviderRef.current;
    const accountId = payload?.accountId ?? trackedAccountIdRef.current;
    const force = payload?.force ?? true;

    if (provider === "antigravity") {
      const isLocal = accountId === "local" || accountId === "local-antigravity-session";
      const targetAcc = isLocal
        ? undefined
        : (antigravityAccountsRef.current.find((a) => a.id === accountId) ??
          antigravityAccountsRef.current[0]);
      if (targetAcc) {
        await params.refreshAntigravityAccountsCloudFirst([targetAcc], force);
      } else if (params.syncLocalSessionFromDisk) {
        await params.syncLocalSessionFromDisk(force);
      } else if (params.refreshLocalSessionQuota) {
        await params.refreshLocalSessionQuota();
      }
    } else if (payload?.provider === "claude" || provider === "claude") {
      await params.refreshClaudeAccountStatuses?.(true);
      await deps.refreshResetCredits(true, accountId ?? undefined);
    } else {
      const targetAcc =
        codexAccountsRef.current.find((a) => a.id === accountId) ?? codexAccountsRef.current[0];
      if (targetAcc) await fetchAccountUsage(targetAcc, force);
    }
    deps.publishOverlayUpdate();
  };
  return refreshTrackedAccountOnly;
}
