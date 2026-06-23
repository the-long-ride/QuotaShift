export interface GoogleUserInfo {
  email?: string;
  picture?: string;
  name?: string;
}

export function obfuscate(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

export function deobfuscate(value: string): string {
  try {
    return decodeURIComponent(escape(atob(value)));
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
    const json = decodeURIComponent(escape(atob(b64)));
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
