import React from "react";
import { deobfuscate } from "../../utils/auth/auth";
import { CodexAccount } from "../../utils/common/types";

export function resolveCodexAvatarUrl(
  profileUrl?: string,
  apiKey?: string,
  jwtDecoder?: (token: string | null | undefined) => { picture?: string | null } | null,
) {
  let avatarUrl = "";
  if (profileUrl) {
    try {
      const dec = deobfuscate(profileUrl);
      if (dec && dec.startsWith("http")) avatarUrl = dec;
    } catch (e) {
      console.error("Avatar parse error:", e);
    }
  }
  if (!avatarUrl && apiKey && jwtDecoder) {
    try {
      const rawKey = deobfuscate(apiKey);
      if (rawKey.startsWith("{")) {
        const profile = jwtDecoder(JSON.parse(rawKey).idToken);
        if (profile?.picture && profile.picture.startsWith("http")) {
          avatarUrl = profile.picture;
        }
      }
    } catch {}
  }
  return avatarUrl;
}

export function resolveCodexResetCredits(acc: CodexAccount, cache?: any) {
  const resetCredits =
    cache?.resetCredits ?? (cache?.rate_limit as any)?.reset_credits ?? acc.resetCredits;
  const availableResets = resetCredits
    ? (resetCredits.available_count ?? resetCredits.credits?.length ?? 0)
    : acc.lastResets
      ? parseInt(acc.lastResets, 10) || 0
      : 0;
  return { resetCredits, availableResets };
}

export const codexEmailBaseStyle: React.CSSProperties = {
  fontSize: "8.5px",
  color: "var(--codex-accent, #4ade80)",
  textOverflow: "ellipsis",
  overflow: "hidden",
  whiteSpace: "nowrap",
  minWidth: 0,
  cursor: "pointer",
  textDecoration: "underline",
  textDecorationStyle: "dotted",
  textUnderlineOffset: "2px",
};

export function createCopyEmailHandlers(
  id: string,
  email: string | undefined,
  handleCopy: (id: string, email: string, el?: HTMLElement) => void,
) {
  return {
    onClick: (e: React.SyntheticEvent) => {
      e.stopPropagation();
      if (email) handleCopy(id, email, e.currentTarget as HTMLElement);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if ((e.key === "Enter" || e.key === " ") && email) {
        e.stopPropagation();
        handleCopy(id, email, e.currentTarget as HTMLElement);
      }
    },
  };
}
