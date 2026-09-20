import type {
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
  CodexRouterAccountConfig,
  CodexRouterConfig,
} from "../common/types";
import { isUsageCacheFresh } from "../account/account-selection.js";
import { isCodexModelCacheFresh } from "./codex-models.js";
import { normalizeCodexUsageWindows } from "./codex-usage-windows.js";

export interface BuildCodexRouterConfigInput {
  accounts: CodexAccount[];
  pools: CodexAccountPool[];
  usageCache: Record<string, any>;
  modelCache: Record<string, CodexModelCatalogCacheEntry>;
  appliedAccountId: string | null;
  activePoolId: string | null;
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
  activePoolId,
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
    const freshUsage = isUsageCacheFresh(usage);
    const quotaWindows = freshUsage
      ? normalizeCodexUsageWindows(usage?.rate_limit).map((window) => ({
          remainingPercent: Math.max(0, Math.min(100, 100 - window.usedPercent)),
          durationMinutes: window.durationMinutes,
        }))
      : [];
    const catalog = modelCache[account.id];
    const successfulCatalog = isCodexModelCacheFresh(catalog) ? catalog : null;
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
      usageFetchedAt: freshUsage ? finiteNumber(usage?.fetchedAt) : null,
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
    })),
    appliedAccountId,
    activePoolId,
  };
};

export const CODEX_ROUTER_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
export const CODEX_ROUTER_TOKEN_FALLBACK_MAX_AGE_MS = 45 * 60 * 1000;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (encoded.length % 4 !== 0) encoded += "=";
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function codexAccessTokenExpiryMs(accessToken: string): number | null {
  const exp = decodeJwtPayload(accessToken)?.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
}

export function shouldRefreshCodexRouterOAuth(
  oauthData: Record<string, any>,
  now = Date.now(),
): boolean {
  const refreshToken = oauthData.refreshToken ?? oauthData.refresh_token;
  if (typeof refreshToken !== "string" || !refreshToken.trim()) return false;

  const accessToken = oauthData.accessToken ?? oauthData.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) return true;

  const expiry = codexAccessTokenExpiryMs(accessToken);
  if (expiry != null) return expiry <= now + CODEX_ROUTER_TOKEN_REFRESH_SKEW_MS;

  const lastRefreshRaw = oauthData.lastRefresh ?? oauthData.last_refresh;
  const lastRefresh =
    typeof lastRefreshRaw === "string" && lastRefreshRaw.trim()
      ? new Date(lastRefreshRaw).getTime()
      : Number.NaN;
  if (!Number.isFinite(lastRefresh)) return true;
  return now - lastRefresh >= CODEX_ROUTER_TOKEN_FALLBACK_MAX_AGE_MS;
}

export async function refreshActivePoolOAuthCredentials(input: {
  accounts: CodexAccount[];
  pools: CodexAccountPool[];
  activePoolId: string | null;
  decodeCredential: (value: string) => string;
  encodeCredential: (value: string) => string;
  refreshToken: (refreshToken: string, account: CodexAccount) => Promise<any>;
  now?: number;
  shouldAttempt?: (accountId: string, now: number) => boolean;
  onAttempt?: (accountId: string, now: number) => void;
}): Promise<{
  accounts: CodexAccount[];
  refreshedAccountIds: string[];
  failedAccountIds: string[];
}> {
  const now = input.now ?? Date.now();
  const activePool = input.activePoolId
    ? input.pools.find((pool) => pool.id === input.activePoolId)
    : null;
  if (!activePool) {
    return { accounts: input.accounts, refreshedAccountIds: [], failedAccountIds: [] };
  }

  const memberIds = new Set(activePool.accountIds);
  const refreshedAccountIds: string[] = [];
  const failedAccountIds: string[] = [];
  const accounts = [...input.accounts];

  for (let index = 0; index < accounts.length; index += 1) {
    const account = accounts[index];
    if (!memberIds.has(account.id)) continue;

    let rawCredential: string;
    try {
      rawCredential = input.decodeCredential(account.apiKey);
    } catch {
      continue;
    }
    if (!rawCredential.trim().startsWith("{")) continue;

    let oauthData: Record<string, any>;
    try {
      oauthData = JSON.parse(rawCredential);
    } catch {
      continue;
    }
    if (!shouldRefreshCodexRouterOAuth(oauthData, now)) continue;

    const refreshToken = oauthData.refreshToken ?? oauthData.refresh_token;
    if (typeof refreshToken !== "string" || !refreshToken.trim()) continue;
    if (input.shouldAttempt && !input.shouldAttempt(account.id, now)) continue;
    input.onAttempt?.(account.id, now);

    try {
      const refreshed = await input.refreshToken(refreshToken, account);
      const accessToken = refreshed?.access_token ?? refreshed?.accessToken;
      if (typeof accessToken !== "string" || !accessToken.trim()) {
        failedAccountIds.push(account.id);
        continue;
      }
      const nextRefreshToken = refreshed?.refresh_token ?? refreshed?.refreshToken;
      const nextIdToken = refreshed?.id_token ?? refreshed?.idToken;
      accounts[index] = {
        ...account,
        apiKey: input.encodeCredential(
          JSON.stringify({
            ...oauthData,
            accessToken,
            refreshToken:
              typeof nextRefreshToken === "string" && nextRefreshToken.trim()
                ? nextRefreshToken
                : refreshToken,
            ...(typeof nextIdToken === "string" && nextIdToken.trim()
              ? { idToken: nextIdToken }
              : {}),
            lastRefresh: new Date(now).toISOString(),
          }),
        ),
      };
      refreshedAccountIds.push(account.id);
    } catch {
      failedAccountIds.push(account.id);
    }
  }

  return { accounts, refreshedAccountIds, failedAccountIds };
}
