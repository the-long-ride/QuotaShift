import { decodeJwtProfile, obfuscate } from "../auth/auth.js";
import type { CodexAccount } from "../common/types";

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

export const parseCodexLocalAuth = (auth: unknown, label?: string): CodexAccount | null => {
  if (!auth || typeof auth !== "object") return null;
  const values = auth as Record<string, unknown>;
  const authMode = readString(values.auth_mode);

  if (authMode === "chatgpt" && values.tokens && typeof values.tokens === "object") {
    const tokens = values.tokens as Record<string, unknown>;
    const accessToken = readString(tokens.access_token);
    if (!accessToken) return null;
    const refreshToken = readString(tokens.refresh_token);
    const accountId = readString(tokens.account_id) || "shared-local-session";
    const idToken = readString(tokens.id_token);
    const profile = decodeJwtProfile(idToken);
    const email = profile?.email || undefined;
    const accountLabel = readString(label) || email?.split("@", 1)[0] || "Codex CLI";
    const lastRefresh = readString(values.last_refresh) || new Date().toISOString();
    const oauthData = {
      accessToken,
      refreshToken: refreshToken || null,
      accountId,
      idToken,
      lastRefresh,
      isOAuth: true,
    };
    return {
      id: `acct-oauth-${accountId}`,
      label: accountLabel,
      apiKey: obfuscate(JSON.stringify(oauthData)),
      email,
      profileUrl: profile?.picture ? obfuscate(profile.picture) : undefined,
    };
  }

  if (authMode === "openai_api_key") {
    const apiKey = readString(values.OPENAI_API_KEY);
    if (!apiKey) return null;
    const suffix = apiKey.length > 6 ? apiKey.slice(-6) : `key-${Date.now()}`;
    return {
      id: `acct-apikey-${suffix}`,
      label: readString(label) || "Codex CLI",
      apiKey: obfuscate(apiKey),
    };
  }

  return null;
};

export const buildCodexAuthContent = (apiKeyRaw: string): string => {
  if (apiKeyRaw.startsWith("{")) {
    try {
      const data = JSON.parse(apiKeyRaw);
      return JSON.stringify(
        {
          auth_mode: "chatgpt",
          OPENAI_API_KEY: null,
          tokens: {
            id_token: data.idToken || null,
            access_token: data.accessToken,
            refresh_token: data.refreshToken || null,
            account_id: data.accountId,
          },
          last_refresh: data.lastRefresh || new Date().toISOString(),
        },
        null,
        2
      );
    } catch {
      // fallback
    }
  }
  return JSON.stringify({ auth_mode: "openai_api_key", OPENAI_API_KEY: apiKeyRaw }, null, 2);
};
