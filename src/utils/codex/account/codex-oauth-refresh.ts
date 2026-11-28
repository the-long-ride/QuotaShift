import { deobfuscate, obfuscate } from "../../auth/auth.js";
import { normalizeDistinctCodexAccountId } from "../current-local-session.js";
import type { CodexAccount } from "../../common/types";

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isDistinctAccountId(value: unknown): value is string {
  return normalizeDistinctCodexAccountId(value) !== null;
}

/** Merges a ChatGPT OAuth refresh response into stored OAuth JSON credentials. */
export function mergeCodexOAuthRefreshResponse(
  oauthData: Record<string, any>,
  refreshResponse: Record<string, any>,
  refreshedAtIso = new Date().toISOString(),
): Record<string, any> {
  const accessToken = nonEmptyString(refreshResponse?.access_token);
  if (!accessToken) {
    throw new Error("OAuth refresh did not include access_token");
  }

  const refreshToken = nonEmptyString(refreshResponse?.refresh_token);
  const idToken = nonEmptyString(refreshResponse?.id_token);
  const responseAccountId = nonEmptyString(refreshResponse?.account_id);
  const preservedAccountId = isDistinctAccountId(oauthData?.accountId)
    ? oauthData.accountId.trim()
    : responseAccountId;

  const next: Record<string, any> = {
    ...oauthData,
    accessToken,
    lastRefresh: refreshedAtIso,
  };
  if (refreshToken) next.refreshToken = refreshToken;
  if (idToken) next.idToken = idToken;
  if (preservedAccountId) next.accountId = preservedAccountId;

  if (
    oauthData?.tokens &&
    typeof oauthData.tokens === "object" &&
    !Array.isArray(oauthData.tokens)
  ) {
    const preservedNestedAccountId = isDistinctAccountId(oauthData.tokens.account_id)
      ? oauthData.tokens.account_id.trim()
      : preservedAccountId;
    next.tokens = {
      ...oauthData.tokens,
      access_token: accessToken,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      ...(idToken ? { id_token: idToken } : {}),
      ...(preservedNestedAccountId ? { account_id: preservedNestedAccountId } : {}),
    };
  }

  return next;
}

export interface RotatedCodexTokens {
  accessToken: string;
  refreshToken?: string | null;
  idToken?: string | null;
  lastRefresh?: string;
}

/**
 * Propagates a rotated OAuth refresh/access token to sibling cards from the same
 * login session while strictly preserving each sibling's own accountId.
 */
export function propagateRotatedRefreshToken(
  accounts: CodexAccount[],
  sourceAccountId: string,
  previousRefreshToken: string | null | undefined,
  rotated: RotatedCodexTokens,
): CodexAccount[] {
  const prevRt = nonEmptyString(previousRefreshToken);
  const nextAt = nonEmptyString(rotated.accessToken);
  if (!prevRt || !nextAt) return accounts;

  const nextRt = nonEmptyString(rotated.refreshToken);
  const nextId = nonEmptyString(rotated.idToken);
  const refreshedAt = nonEmptyString(rotated.lastRefresh) ?? new Date().toISOString();

  let changed = false;
  const updated = accounts.map((account) => {
    if (account.id === sourceAccountId || !account.apiKey) return account;
    const raw = deobfuscate(account.apiKey);
    if (!raw.startsWith("{")) return account;
    try {
      const parsed = JSON.parse(raw);
      const siblingRt = nonEmptyString(parsed?.refreshToken ?? parsed?.tokens?.refresh_token);
      if (siblingRt !== prevRt) return account;

      const merged = mergeCodexOAuthRefreshResponse(
        parsed,
        {
          access_token: nextAt,
          ...(nextRt ? { refresh_token: nextRt } : {}),
          ...(nextId ? { id_token: nextId } : {}),
        },
        refreshedAt,
      );
      changed = true;
      return { ...account, apiKey: obfuscate(JSON.stringify(merged)) };
    } catch {
      return account;
    }
  });

  return changed ? updated : accounts;
}
