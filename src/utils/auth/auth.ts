/**
 * Convert a UTF-8 string to a binary (Latin-1) string safe for btoa.
 */
function toBinary(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
}

/**
 * Convert a binary (Latin-1) string from atob back to UTF-8.
 */
function fromBinary(bin: string): string {
  const bytes = Uint8Array.from(bin, (c) => c.codePointAt(0)!);
  return new TextDecoder().decode(bytes);
}

export interface GoogleUserInfo {
  email?: string;
  picture?: string;
  name?: string;
}

export function obfuscate(value: string): string {
  return btoa(toBinary(value));
}

export function deobfuscate(value: string): string {
  try {
    return fromBinary(atob(value));
  } catch {
    return value;
  }
}

export interface JwtProfile {
  email?: string | null;
  picture?: string | null;
  name?: string | null;
}

export interface OpenAiAuthOrganization {
  id: string;
  title?: string | null;
  role?: string | null;
  isDefault?: boolean;
}

export interface OpenAiAuthClaims {
  chatgptAccountId: string | null;
  chatgptPlanType: string | null;
  chatgptUserId: string | null;
  organizations: OpenAiAuthOrganization[];
}

export function decodeJwtPayload(token: string | null | undefined): Record<string, any> | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) {
      b64 += "=";
    }
    const json = fromBinary(atob(b64));
    const payload = JSON.parse(json);
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

function trimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function decodeJwtProfile(idToken: string | null | undefined): JwtProfile | null {
  const payload = decodeJwtPayload(idToken);
  if (!payload) return null;
  const picture =
    payload.picture ||
    payload.avatar_url ||
    payload["https://api.openai.com/profile"]?.picture ||
    null;
  return {
    email: payload.email || null,
    picture: typeof picture === "string" ? picture : null,
    name: payload.name || null,
  };
}

export function parseOpenAiAuthClaims(token: string | null | undefined): OpenAiAuthClaims | null {
  const payload = decodeJwtPayload(token);
  const auth = payload?.["https://api.openai.com/auth"];
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) return null;

  const chatgptAccountId = trimmedString(auth.chatgpt_account_id);
  const chatgptPlanType = trimmedString(auth.chatgpt_plan_type);
  const chatgptUserId = trimmedString(auth.chatgpt_user_id);
  const organizations: OpenAiAuthOrganization[] = Array.isArray(auth.organizations)
    ? auth.organizations.flatMap((org: any) => {
        const id = trimmedString(org?.id);
        if (!id) return [];
        return [
          {
            id,
            title: trimmedString(org?.title),
            role: trimmedString(org?.role),
            ...(typeof org?.is_default === "boolean" ? { isDefault: org.is_default } : {}),
          },
        ];
      })
    : [];

  if (!chatgptAccountId && !chatgptPlanType && !chatgptUserId && organizations.length === 0) {
    return null;
  }

  return {
    chatgptAccountId,
    chatgptPlanType,
    chatgptUserId,
    organizations,
  };
}

export function decodeJwtEmail(idToken: string | null | undefined): string | null {
  const profile = decodeJwtProfile(idToken);
  return profile?.email || null;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.error("Failed to fetch Google UserInfo:", e);
  }
  return null;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
