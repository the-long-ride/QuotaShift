import React from "react";
import { deobfuscate } from "../../utils/auth/auth";
import { AntigravityAccount, AntigravityUsageCacheEntry } from "../../utils/common/types";
import { aggregateCloudQuotasIntoPools } from "../../utils/antigravity/antigravity-quota";
import { resolveAntigravityPlanName } from "../../utils/common/app-constants";

export function resolveAntigravityCardDisplay(
  acc: AntigravityAccount,
  cache?: AntigravityUsageCacheEntry,
) {
  const cachedCloudQuotas = cache?.cloudQuotas
    ? aggregateCloudQuotasIntoPools(cache.cloudQuotas)
    : [];
  const accountCloudQuotas = acc.cloudQuotas ? aggregateCloudQuotasIntoPools(acc.cloudQuotas) : [];
  const displayQuotas =
    cache?.accuracy === "exact_grouped"
      ? cachedCloudQuotas
      : cache?.quotas?.length
        ? cache.quotas
        : acc.quotas?.length
          ? acc.quotas
          : cachedCloudQuotas.length
            ? cachedCloudQuotas
            : accountCloudQuotas;
  const displayPlan = resolveAntigravityPlanName(cache?.planTier) || acc.lastPlan || "—";
  const displayBalance = cache?.credits
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
        cache.credits.balance,
      )
    : acc.lastBalance || "—";
  let avatarUrl = "";
  if (acc.profileUrl) {
    try {
      const dec = deobfuscate(acc.profileUrl);
      if (dec && dec.startsWith("http")) avatarUrl = dec;
    } catch {}
  }
  return { displayQuotas, displayPlan, displayBalance, avatarUrl };
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
