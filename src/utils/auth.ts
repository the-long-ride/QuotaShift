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

export function decodeJwtEmail(idToken: string | null | undefined): string | null {
  if (!idToken) return null;
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = fromBinary(atob(b64));
    const payload = JSON.parse(json);
    return payload.email || null;
  } catch {
    return null;
  }
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
