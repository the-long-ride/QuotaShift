import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  ExactAntigravityAccountRequest,
  ExactAntigravityAccountResult,
} from "../common/types.js";

export const PERSISTENT_WORKER_KEY = "quotashift_antigravity_persistent_workers_v1";

type StorageReader = Pick<Storage, "getItem">;

export function loadPersistentWorkerPreference(storage: StorageReader = localStorage): boolean {
  return storage.getItem(PERSISTENT_WORKER_KEY) === "true";
}

export function savePersistentWorkerPreference(
  enabled: boolean,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(PERSISTENT_WORKER_KEY, enabled ? "true" : "false");
}

export function buildExactRequest(
  account: AntigravityAccount,
  decode: (value: string) => string,
): ExactAntigravityAccountRequest | null {
  const email = account.email?.trim();
  if (!email || !account.token) return null;
  const accessToken = decode(account.token).trim();
  if (!accessToken) return null;
  return {
    accountId: account.id,
    email,
    accessToken,
    refreshToken: account.refreshToken ? decode(account.refreshToken) : null,
    profileUrl: account.profileUrl ? decode(account.profileUrl) : null,
    authMethod: account.authMethod ?? null,
  };
}

export function mergeExactResult(
  previous: AntigravityUsageCacheEntry | undefined,
  result: ExactAntigravityAccountResult,
  now = Date.now(),
): AntigravityUsageCacheEntry {
  if (result.state === "exact" && result.status) {
    return {
      ...previous,
      loading: false,
      exactState: "exact",
      quotas: result.status.quotas,
      planTier: result.status.planTier,
      email: result.status.email ?? null,
      credits: result.status.credits,
      source: "exact",
      fetchedAt: now,
      lastExactFetchedAt: now,
      error: undefined,
      workerMessage: "Exact quota refreshed",
    };
  }

  const hasExactCache = Boolean(previous?.quotas?.length && previous.lastExactFetchedAt);
  const isIdeNotFound = Boolean(
    result.error && /antigravity ide|executable not found/i.test(result.error),
  );
  const hasWorkingCloud = Boolean(
    (previous?.cloudQuotas && previous.cloudQuotas.length > 0) ||
      previous?.source === "cloud" ||
      previous?.accuracy === "exact_grouped",
  );

  return {
    ...previous,
    loading: false,
    exactState: hasWorkingCloud && isIdeNotFound ? (previous?.exactState || "idle") : result.state,
    source: hasExactCache ? "cached_exact" : previous?.source,
    fetchedAt: previous?.fetchedAt ?? now,
    error: hasWorkingCloud && isIdeNotFound ? undefined : (result.error ?? "Exact Antigravity quota refresh failed"),
    workerMessage: hasWorkingCloud && isIdeNotFound ? (previous?.workerMessage || "Cloud summary available") : previous?.workerMessage,
  };
}

export function markCloudFallback(
  previous: AntigravityUsageCacheEntry | undefined,
  cloudEntry: Partial<AntigravityUsageCacheEntry>,
): AntigravityUsageCacheEntry {
  return {
    ...previous,
    ...cloudEntry,
    loading: false,
    exactState: "cloud_fallback",
    source: "cloud_fallback",
    workerMessage: "Cloud fallback — weekly quota may be unavailable",
    error: cloudEntry.error !== undefined ? cloudEntry.error : undefined,
  };
}
