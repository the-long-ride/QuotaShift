import React from "react";
import { deobfuscate } from "../../../utils/auth/auth";
import { AntigravityAccount, AntigravityUsageCacheEntry } from "../../../utils/common/types";
import { aggregateCloudQuotasIntoPools } from "../../../utils/antigravity/quota/antigravity-quota";
import {
  findImageGenerationQuota,
  selectDisplayedCloudQuotas,
} from "../../../utils/antigravity/quota/antigravity-image-quota";
import { resolveAntigravityPlanName } from "../../../utils/common/backup/app-constants";
import { filterAccountsByQuery } from "../../../utils/account/account-search";
import { classifyAntigravityTier } from "../../../utils/antigravity/quota/antigravity-tier-summary";

export function resolveAntigravityCardDisplay(
  acc: AntigravityAccount,
  cache?: AntigravityUsageCacheEntry,
) {
  const cloudQuotas = selectDisplayedCloudQuotas(acc, cache);
  const displayQuotas = cloudQuotas
    ? aggregateCloudQuotasIntoPools(cloudQuotas)
    : ((cache?.quotas?.length ? cache.quotas : acc.quotas) ?? []);
  const imageQuota = findImageGenerationQuota(cloudQuotas);
  const displayPlan = resolveAntigravityPlanName(cache?.planTier) || acc.lastPlan || "—";
  const premiumModels = cache?.premiumModels ?? acc.premiumModels ?? null;
  const currentBalance = cache?.credits?.balance;
  const previousBalance =
    typeof acc.lastBalance === "string" &&
    /^(?:USD\s*)?\$?\s*-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/i.test(acc.lastBalance.trim())
      ? acc.lastBalance.trim()
      : null;
  const displayBalance =
    typeof currentBalance === "number" && Number.isFinite(currentBalance)
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
          currentBalance,
        )
      : previousBalance;
  let avatarUrl = "";
  if (acc.profileUrl) {
    try {
      const dec = deobfuscate(acc.profileUrl);
      if (dec && dec.startsWith("http")) avatarUrl = dec;
    } catch {}
  }
  return { displayQuotas, imageQuota, displayPlan, premiumModels, displayBalance, avatarUrl };
}

export function computeAntigravityViewState(
  accounts: AntigravityAccount[],
  usageCache: Record<string, AntigravityUsageCacheEntry>,
  searchQuery: string | undefined,
  selectedTier: string | null,
) {
  const searchFilteredAccounts = filterAccountsByQuery(accounts, searchQuery);
  const filteredAccounts = searchFilteredAccounts.filter(
    (account) =>
      !selectedTier ||
      classifyAntigravityTier(usageCache[account.id]?.planTier ?? account.lastPlan) ===
        selectedTier,
  );
  const isFiltered = Boolean((searchQuery || "").trim()) || selectedTier !== null;
  return { searchFilteredAccounts, filteredAccounts, isFiltered };
}

export function resolveEffectiveTrackedAntigravityId(
  trackedProvider: string | null | undefined,
  trackedAccountId: string | null | undefined,
  activeId: string | null | undefined,
  lastFullStatus?: { monitoredCodex?: unknown } | null,
): string | null {
  if (trackedProvider !== "antigravity") return null;
  if (trackedAccountId != null) return trackedAccountId;
  return activeId && (!lastFullStatus || !lastFullStatus.monitoredCodex) ? activeId : null;
}

export function useFailedAvatarIds(accounts: AntigravityAccount[]) {
  const [failedAvatarIds, setFailedAvatarIds] = React.useState<Set<string>>(new Set());
  const prevAvatarsRef = React.useRef<Record<string, string | undefined>>({});

  React.useEffect(() => {
    setFailedAvatarIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const account of accounts) {
        if (
          prevAvatarsRef.current[account.id] !== undefined &&
          prevAvatarsRef.current[account.id] !== account.profileUrl &&
          next.has(account.id)
        ) {
          next.delete(account.id);
          changed = true;
        }
        prevAvatarsRef.current[account.id] = account.profileUrl;
      }
      return changed ? next : prev;
    });
  }, [accounts]);

  const markAvatarFailed = (id: string) => setFailedAvatarIds((prev) => new Set(prev).add(id));
  return { failedAvatarIds, markAvatarFailed };
}

export const emailBaseStyle: React.CSSProperties = {
  fontSize: "8.5px",
  color: "var(--codex-accent, #4ade80)",
  textOverflow: "ellipsis",
  overflow: "hidden",
  whiteSpace: "nowrap",
  minWidth: 0,
  cursor: "pointer",
  textDecoration: "underline",
  textDecorationStyle: "dotted",
  textUnderlineOffset: "2px",
};
