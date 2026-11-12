import type { AntigravityAccount, AntigravityUsageCacheEntry, CodexAccount } from "../../utils/common/types";
import type { CliProvider, CliRotationPoolV1, CliQuotaWindowKind } from "../../utils/cli-pools/types";
import { loadCliRotationBindings, loadCliRotationPools } from "../../utils/common/backup/app-storage";
import { loadCliRotationPreferences } from "../../utils/cli-pools/preferences";
import { loadRestartOnSwitch } from "../../utils/common/settings/restart-on-switch";
import { buildAgentApiSnapshot } from "../../utils/agent-api/snapshot";
import { nextEligibleCandidate, observePoolQuota } from "../../utils/cli-pools/auto-failover";

interface LiveContext {
  antigravityAccounts: AntigravityAccount[];
  codexAccounts: CodexAccount[];
  agCache: Record<string, AntigravityUsageCacheEntry>;
  cxCache: Record<string, any>;
  activeAntigravityId: string | null;
  activeCodexId: string | null;
}
interface Check {
  provider: CliProvider;
  pool: CliRotationPoolV1;
  active: string;
  nextId: string;
  window: CliQuotaWindowKind;
  resetEpoch: number | null;
  latest: LiveContext;
  maxAge: number;
}

/** Check live state again after asynchronous native process discovery. */
export function assertAutoRotationStillEligible({
  provider, pool, active, nextId, window, resetEpoch, latest, maxAge,
}: Check): void {
  const stillActive = provider === "agy"
    ? latest.activeAntigravityId === active : latest.activeCodexId === active;
  const updatedPools = loadCliRotationPools();
  const updatedBindings = loadCliRotationBindings(updatedPools);
  const updatedPoolId = provider === "agy"
    ? updatedBindings.agyActivePoolId : updatedBindings.codexActivePoolId;
  const updatedPool = updatedPools.find((candidate) =>
    candidate.provider === provider && candidate.id === updatedPoolId);
  if (!stillActive || !loadCliRotationPreferences().enabled || !loadRestartOnSwitch() ||
    !updatedPool || !updatedPool.enabled || !updatedPool.autoSwitch ||
    updatedPool.switchWhenIdleOnly || updatedPool.id !== pool.id ||
    updatedPool.accountIds.join("|") !== pool.accountIds.join("|") ||
    updatedPool.triggerWindows.join("|") !== pool.triggerWindows.join("|")) {
    throw new Error("CLI pool selection changed while planning");
  }
  const latestNow = Date.now();
  const latestSnapshot = buildAgentApiSnapshot(
    latest.antigravityAccounts, latest.codexAccounts,
    latest.agCache, latest.cxCache,
    latest.activeAntigravityId, latest.activeCodexId,
  );
  const latestEntry = provider === "agy" ? latest.agCache[active] : latest.cxCache[active];
  const latestReading = observePoolQuota(provider, latestEntry, window, latestNow, maxAge);
  if (!latestReading || latestReading.remaining !== 0 ||
    latestReading.resetAt !== resetEpoch ||
    nextEligibleCandidate(updatedPool, active, latestSnapshot.accounts, latestNow, maxAge) !== nextId) {
    throw new Error("Fresh quota evidence or available candidate changed during preflight");
  }
}
