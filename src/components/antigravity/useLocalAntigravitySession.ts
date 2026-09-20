import { useMemo } from "react";
import {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  LocalAntigravitySession,
} from "../../utils/common/types";
import { aggregateCloudQuotasIntoPools } from "../../utils/antigravity/antigravity-quota";
import { resolveAntigravityPlanName } from "../../utils/common/app-constants";
import {
  createEmptyLocalAntigravitySession,
  resolveLocalSessionDisplayQuotas,
} from "../../utils/antigravity/local-antigravity-session";
import {
  findAntigravityAccountMatch,
  normalizeAccountIdentity,
} from "../../utils/account/current-account";

export function useLocalAntigravitySession(
  rawLocalSession: Partial<LocalAntigravitySession> | null | undefined,
  accounts: AntigravityAccount[],
  appliedId: string | null,
  antigravityUsageCache: Record<string, AntigravityUsageCacheEntry>,
) {
  const localSession: LocalAntigravitySession = {
    ...createEmptyLocalAntigravitySession(),
    ...rawLocalSession,
    quotas: rawLocalSession?.quotas || [],
  };

  const currentLocalSessionAccountId = useMemo(() => {
    if (localSession.email) {
      const norm = normalizeAccountIdentity(localSession.email);
      const match = accounts.find((a) => a.email && normalizeAccountIdentity(a.email) === norm);
      if (match) return match.id;
    }
    if (localSession.capturedAccount) {
      const candidate: AntigravityAccount = {
        id: "local-session",
        label: "local-session",
        token: localSession.capturedAccount.token || "",
        refreshToken: localSession.capturedAccount.refreshToken,
        email: localSession.capturedAccount.email || localSession.email || undefined,
      };
      const match = findAntigravityAccountMatch(accounts, candidate);
      if (match) return match.id;
    }
    return appliedId && accounts.some((a) => a.id === appliedId) ? appliedId : null;
  }, [accounts, localSession, appliedId]);

  const matchedLocalAccount = useMemo(
    () =>
      currentLocalSessionAccountId
        ? accounts.find((a) => a.id === currentLocalSessionAccountId)
        : null,
    [accounts, currentLocalSessionAccountId],
  );

  const localCache = currentLocalSessionAccountId
    ? antigravityUsageCache[currentLocalSessionAccountId]
    : null;

  const localDisplayQuotas = useMemo(
    () =>
      resolveLocalSessionDisplayQuotas(
        rawLocalSession?.quotas,
        localCache?.cloudQuotas ? aggregateCloudQuotasIntoPools(localCache.cloudQuotas) : [],
        localCache?.quotas,
        matchedLocalAccount?.quotas,
        matchedLocalAccount?.cloudQuotas
          ? aggregateCloudQuotasIntoPools(matchedLocalAccount.cloudQuotas)
          : [],
        localCache?.accuracy === "exact_grouped",
      ),
    [rawLocalSession?.quotas, localCache, matchedLocalAccount],
  );

  const localDisplayPlan =
    resolveAntigravityPlanName(rawLocalSession?.planTier) ||
    resolveAntigravityPlanName(localCache?.planTier) ||
    matchedLocalAccount?.lastPlan ||
    "Local profile";

  const isLocalSessionActive = Boolean(
    localSession.online ||
    (localSession.email && (localDisplayQuotas.length > 0 || localSession.quotas.length > 0)),
  );

  return {
    localSession,
    currentLocalSessionAccountId,
    matchedLocalAccount,
    localCache,
    localDisplayQuotas,
    localDisplayPlan,
    isLocalSessionActive,
  };
}
