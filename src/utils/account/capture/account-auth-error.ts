export function accountErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const parts = [value.code, value.message, value.error, value.error_description]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());
    if (parts.length > 0) return parts.join(": ");
    try {
      return JSON.stringify(value);
    } catch {}
  }
  return String(error ?? "");
}

export function isAccountReauthenticationError(error: unknown): boolean {
  const text = accountErrorText(error);
  if (!text) return false;
  return /(?:\b401\b|\b403\b|unauthori[sz]ed|forbidden|reauth(?:entication)?[_ -]?required|invalid[_ -]?grant|token refresh failed|refresh token.*(?:expired|invalid|revoked)|invalid api key|could not determine client id)/i.test(
    text,
  );
}
