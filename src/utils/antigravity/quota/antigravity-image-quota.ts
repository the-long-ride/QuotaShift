import type {
  AntigravityAccount,
  AntigravityModelQuota,
  AntigravityUsageCacheEntry,
} from "../../common/types";

export const IMAGE_GENERATION_MODEL_ID = "image_generation_pool";

export function selectDisplayedCloudQuotas(
  account: Pick<AntigravityAccount, "cloudQuotas">,
  cache?: Pick<AntigravityUsageCacheEntry, "cloudQuotas" | "quotas">,
): AntigravityModelQuota[] | null {
  if (cache?.cloudQuotas !== undefined) return cache.cloudQuotas;
  if (cache?.quotas?.length) return null;
  return account.cloudQuotas ?? null;
}

export function findImageGenerationQuota(
  quotas: readonly AntigravityModelQuota[] | null | undefined,
): AntigravityModelQuota | null {
  return (
    quotas?.find(
      (quota) => quota.modelId === IMAGE_GENERATION_MODEL_ID && Number.isFinite(quota.remainingPercent),
    ) ?? null
  );
}

