import type {
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
  CodexRouterAccountConfig,
  CodexRouterConfig,
} from "../common/types";
import { normalizeCodexUsageWindows } from "./codex-usage-windows.js";

export interface BuildCodexRouterConfigInput {
  accounts: CodexAccount[];
  pools: CodexAccountPool[];
  usageCache: Record<string, any>;
  modelCache: Record<string, CodexModelCatalogCacheEntry>;
  appliedAccountId: string | null;
  decodeCredential: (value: string) => string;
}

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const buildCodexRouterConfig = ({
  accounts,
  pools,
  usageCache,
  modelCache,
  appliedAccountId,
  decodeCredential,
}: BuildCodexRouterConfigInput): CodexRouterConfig => {
  const routerAccounts: CodexRouterAccountConfig[] = [];

  for (const account of accounts) {
    let decoded: string;
    try {
      decoded = decodeCredential(account.apiKey);
    } catch {
      continue;
    }

    let auth: CodexRouterAccountConfig["auth"];
    if (decoded.trim().startsWith("{")) {
      try {
        const oauth = JSON.parse(decoded);
        const accessToken = oauth.accessToken ?? oauth.access_token;
        const refreshToken = oauth.refreshToken ?? oauth.refresh_token ?? null;
        const chatgptAccountId = oauth.accountId ?? oauth.account_id;
        if (
          typeof accessToken !== "string" ||
          !accessToken ||
          typeof chatgptAccountId !== "string" ||
          !chatgptAccountId
        )
          continue;
        auth = {
          kind: "oAuth",
          accessToken,
          refreshToken: typeof refreshToken === "string" ? refreshToken : null,
          chatgptAccountId,
        };
      } catch {
        continue;
      }
    } else {
      const apiKey = decoded.trim();
      if (!apiKey) continue;
      auth = { kind: "apiKey", apiKey };
    }

    const usage = usageCache[account.id];
    const quotaWindows = normalizeCodexUsageWindows(usage?.rate_limit).map((window) => ({
      remainingPercent: Math.max(0, Math.min(100, 100 - window.usedPercent)),
      durationMinutes: window.durationMinutes,
    }));
    const catalog = modelCache[account.id];
    const successfulCatalog = catalog && !catalog.error ? catalog : null;
    const availableModelIds = successfulCatalog
      ? successfulCatalog.models
          .map((model) => model.id)
          .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : null;

    routerAccounts.push({
      id: account.id,
      auth,
      availableModelIds,
      quotaWindows,
      usageFetchedAt: finiteNumber(usage?.fetchedAt),
      modelCatalogFetchedAt: finiteNumber(successfulCatalog?.fetchedAt),
    });
  }

  return {
    accounts: routerAccounts,
    pools: pools.map((pool) => ({
      id: pool.id,
      model: pool.model,
      accountIds: [...pool.accountIds],
      modelSelectionMode: pool.modelSelectionMode ?? "manual",
      activatedAt: Number.isFinite(pool.activatedAt) ? pool.activatedAt! : 0,
    })),
    appliedAccountId,
  };
};
