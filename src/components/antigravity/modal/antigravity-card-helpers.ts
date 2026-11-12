import React from "react";
import { deobfuscate } from "../../../utils/auth/auth";
import { AntigravityAccount, AntigravityUsageCacheEntry } from "../../../utils/common/types";
import { aggregateCloudQuotasIntoPools } from "../../../utils/antigravity/quota/antigravity-quota";
import { resolveAntigravityPlanName } from "../../../utils/common/backup/app-constants";

export function resolveAntigravityCardDisplay(
  acc: AntigravityAccount,
  cache?: AntigravityUsageCacheEntry,
) {
  const cachedCloudQuotas = cache?.cloudQuotas
    ? aggregateCloudQuotasIntoPools(cache.cloudQuotas)
    : [];
  const accountCloudQuotas = acc.cloudQuotas ? aggregateCloudQuotasIntoPools(acc.cloudQuotas) : [];
  const displayQuotas =
    cache?.cloudQuotas !== undefined
      ? cachedCloudQuotas
      : cache?.quotas?.length
        ? cache.quotas
        : acc.cloudQuotas !== undefined
          ? accountCloudQuotas
          : (acc.quotas ?? []);
  const displayPlan = resolveAntigravityPlanName(cache?.planTier) || acc.lastPlan || "—";
  const currentBalance = cache?.credits?.balance;
  const previousBalance = typeof acc.lastBalance === "string"
    && /^(?:USD\\s*)?\\$?\\s*-?(?:\\d+|\\d{1,3}(?:,\\d{3})+)(?:\\.\\d{1,2})?$/i.test(acc.lastBalance.trim())
      ? acc.lastBalance.trim() : null;
  const displayBalance = typeof currentBalance === "number" && Number.isFinite(currentBalance)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(currentBalance)
    : previousBalance;
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
