import { decodeJwtPayload, deobfuscate } from "../../auth/auth.js";

const SHARED_LOCAL_SESSION_ID = "shared-local-session";

export function parseCredentialTimestampMs(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric < 1e12 ? Math.round(numeric * 1000) : Math.round(numeric);
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function extractJwtRefreshTimeMs(token: unknown): number | null {
  if (typeof token !== "string" || !token.trim()) return null;
  const payload = decodeJwtPayload(token.trim());
  if (!payload) return null;
  return parseCredentialTimestampMs(payload.iat) ?? parseCredentialTimestampMs(payload.auth_time);
}

function parseCodexOAuthPayload(account: any): Record<string, any> | null {
  if (typeof account?.apiKey !== "string" || !account.apiKey) return null;
  const raw = deobfuscate(account.apiKey).trim();
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function extractCodexOAuthAccountId(account: any): string | null {
  const parsed = parseCodexOAuthPayload(account);
  if (!parsed) return null;
  const rawId = parsed.accountId ?? parsed.tokens?.account_id;
  if (typeof rawId !== "string") return null;
  const trimmed = rawId.trim();
  return trimmed && trimmed !== SHARED_LOCAL_SESSION_ID ? trimmed : null;
}

export function extractCodexCredentialRefreshTimeMs(
  account: any,
  fallbackMs: number | null = null,
): number | null {
  const parsed = parseCodexOAuthPayload(account);
  if (parsed) {
    for (const candidate of [
      parsed.lastRefresh,
      parsed.last_refresh,
      parsed.tokens?.last_refresh,
      parsed.tokens?.lastRefresh,
      parsed.refreshedAt,
      parsed.tokenRefreshedAt,
    ]) {
      const ts = parseCredentialTimestampMs(candidate);
      if (ts !== null) return ts;
    }
    const jwtTimes = [
      extractJwtRefreshTimeMs(parsed.accessToken ?? parsed.tokens?.access_token),
      extractJwtRefreshTimeMs(parsed.idToken ?? parsed.tokens?.id_token),
    ].filter((value): value is number => value !== null);
    if (jwtTimes.length > 0) {
      return Math.max(...jwtTimes);
    }
  }
  for (const candidate of [
    account?.tokenRefreshedAt,
    account?.lastRefresh,
    account?.last_refresh,
  ]) {
    const ts = parseCredentialTimestampMs(candidate);
    if (ts !== null) return ts;
  }
  return fallbackMs ?? null;
}

export function extractAntigravityCredentialRefreshTimeMs(
  account: any,
  fallbackMs: number | null = null,
): number | null {
  for (const candidate of [
    account?.tokenRefreshedAt,
    account?.refreshTokenUpdatedAt,
    account?.lastRefresh,
    account?.last_refresh,
  ]) {
    const ts = parseCredentialTimestampMs(candidate);
    if (ts !== null) return ts;
  }
  return fallbackMs ?? null;
}

export function isImportedCredentialOlder(
  importedMs: number | null,
  existingMs: number | null,
): boolean {
  return importedMs !== null && existingMs !== null && importedMs < existingMs;
}
