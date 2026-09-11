import { decodeJwtEmail, obfuscate } from "../auth/auth.js";
import type { GoogleUserInfo } from "../auth/auth.js";
import type { AntigravityAccount } from "../common/types";

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

export const extractEmailFromUserStatus = (userStatus: unknown): string | undefined => {
  if (!userStatus) return undefined;
  try {
    const parsed = typeof userStatus === "string" ? JSON.parse(userStatus) : userStatus;
    if (!parsed || typeof parsed !== "object") return undefined;
    const value = parsed as { userInfo?: { email?: unknown }; email?: unknown };
    return readString(value.userInfo?.email) ?? readString(value.email);
  } catch {
    return undefined;
  }
};

export const extractAntigravitySessionAccount = (
  session: unknown,
  label?: string,
  profile?: Partial<GoogleUserInfo> | null,
): AntigravityAccount | null => {
  if (!session || typeof session !== "object") return null;
  const values = session as Record<string, unknown>;
  const token = readString(values["antigravityUnifiedStateSync.oauthToken"]);
  if (!token) return null;

  const email =
    readString(profile?.email) ??
    extractEmailFromUserStatus(values["antigravityUnifiedStateSync.userStatus"]) ??
    readString(decodeJwtEmail(readString(values["antigravity.idToken"])));
  const fallbackLabel = email?.split("@", 1)[0] || "Antigravity";
  const accountLabel = readString(label) || fallbackLabel;
  const profileUrl = readString(profile?.picture) ?? readString(values["antigravity.profileUrl"]);
  const refreshToken = readString(values["antigravity.refreshToken"]);
  const authMethod = readString(values["antigravity.authMethod"]);

  return {
    id: "local-antigravity-session",
    label: accountLabel,
    token: obfuscate(token),
    refreshToken: refreshToken ? obfuscate(refreshToken) : undefined,
    profileUrl: profileUrl ? obfuscate(profileUrl) : undefined,
    email,
    authMethod,
  };
};
