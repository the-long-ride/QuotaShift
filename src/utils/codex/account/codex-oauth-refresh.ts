function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
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
  const accountId = nonEmptyString(refreshResponse?.account_id);

  const next: Record<string, any> = {
    ...oauthData,
    accessToken,
    lastRefresh: refreshedAtIso,
  };
  if (refreshToken) next.refreshToken = refreshToken;
  if (idToken) next.idToken = idToken;
  if (accountId) next.accountId = accountId;

  if (
    oauthData?.tokens &&
    typeof oauthData.tokens === "object" &&
    !Array.isArray(oauthData.tokens)
  ) {
    next.tokens = {
      ...oauthData.tokens,
      access_token: accessToken,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      ...(idToken ? { id_token: idToken } : {}),
      ...(accountId ? { account_id: accountId } : {}),
    };
  }

  return next;
}
