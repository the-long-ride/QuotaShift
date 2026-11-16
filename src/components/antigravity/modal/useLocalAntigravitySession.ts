import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AntigravityAccount, LocalAntigravitySession } from "../../../utils/common/types";
import {
  findAntigravityAccountMatch,
  normalizeAccountIdentity,
} from "../../../utils/account/current-account";
import { extractAntigravitySessionAccount } from "../../../utils/antigravity/current-local-session";
import { fetchGoogleUserInfo, decodeJwtProfile } from "../../../utils/auth/auth";
import type { CapturedAntigravitySource } from "../../../utils/antigravity/capture-import";
import {
  createCapturedAntigravityAccountHandler,
  type CaptureAccountOps,
} from "../../../utils/antigravity/capture-account-ops";
import { loadAccountOrder, sortByOrder } from "../../../utils/account/account-order";
import { ANTIGRAVITY_ORDER_KEY } from "../../../utils/common/backup/app-constants";

export function useLocalAntigravitySession(
  rawLocalSession: Partial<LocalAntigravitySession> | null | undefined,
  accounts: AntigravityAccount[],
  appliedId: string | null,
) {
  const currentLocalSessionAccountId = useMemo(() => {
    if (rawLocalSession?.email) {
      const norm = normalizeAccountIdentity(rawLocalSession.email);
      const match = accounts.find((a) => a.email && normalizeAccountIdentity(a.email) === norm);
      if (match) return match.id;
    }
    if (rawLocalSession?.capturedAccount) {
      const candidate: AntigravityAccount = {
        id: "local-session",
        label: "local-session",
        token: rawLocalSession.capturedAccount.token || "",
        refreshToken: rawLocalSession.capturedAccount.refreshToken,
        email: rawLocalSession.capturedAccount.email || rawLocalSession.email || undefined,
      };
      const match = findAntigravityAccountMatch(accounts, candidate);
      if (match) return match.id;
    }
    return appliedId && accounts.some((a) => a.id === appliedId) ? appliedId : null;
  }, [accounts, rawLocalSession, appliedId]);

  return { currentLocalSessionAccountId };
}

export function useProbeLocalAntigravitySession() {
  const [probing, setProbing] = useState(true);
  const [detectedEmail, setDetectedEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const probe = async () => {
      try {
        const sources = await invoke<CapturedAntigravitySource[]>("read_antigravity_sessions");
        if (!active || !Array.isArray(sources) || sources.length === 0) return;
        for (const source of sources) {
          const account = extractAntigravitySessionAccount(source.session);
          if (!account) continue;
          if (account.email) {
            if (active) setDetectedEmail(account.email);
            return;
          }
          const token = (source.session as Record<string, unknown>)[
            "antigravityUnifiedStateSync.oauthToken"
          ];
          if (typeof token === "string") {
            try {
              const profile = await fetchGoogleUserInfo(token);
              if (profile?.email && active) {
                setDetectedEmail(profile.email);
                return;
              }
            } catch {
              // Ignore UserInfo lookup failure during passive probe.
            }
          }
        }
      } catch {
        // Ignore probe failures when no local Antigravity session is available.
      } finally {
        if (active) setProbing(false);
      }
    };
    void probe();
    return () => {
      active = false;
    };
  }, []);

  return { probing, detectedEmail };
}

export function createNativeCaptureAccountHandler(ops: CaptureAccountOps) {
  const baseCaptureHandler = createCapturedAntigravityAccountHandler(ops);

  return async (
    candidates: AntigravityAccount[],
    currentAccount: AntigravityAccount,
  ): Promise<number> => {
    const taggedCandidates = candidates.map((candidate) => ({
      ...candidate,
      authSource: "native_capture" as const,
    }));
    const taggedCurrent: AntigravityAccount = {
      ...currentAccount,
      authSource: "native_capture",
    };
    const addedCount = await baseCaptureHandler(taggedCandidates, taggedCurrent);

    let upgraded = false;
    const updated = ops.loadAccounts().map((existing) => {
      const existingEmail = existing.email?.trim().toLowerCase();
      if (!existingEmail) return existing;
      const match = taggedCandidates.find(
        (candidate) => candidate.email?.trim().toLowerCase() === existingEmail,
      );
      if (!match) return existing;
      upgraded = true;
      return {
        ...existing,
        token: match.token,
        refreshToken: match.refreshToken ?? existing.refreshToken,
        profileUrl: match.profileUrl ?? existing.profileUrl,
        authMethod: match.authMethod ?? existing.authMethod,
        authSource: "native_capture" as const,
      };
    });

    if (upgraded) {
      ops.saveAccounts(sortByOrder(updated, loadAccountOrder(ANTIGRAVITY_ORDER_KEY)));
    }
    return addedCount;
  };
}

export function buildOAuthScopeWarningMessage(missingScopes?: unknown): string {
  const missingList = Array.isArray(missingScopes)
    ? missingScopes.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];
  const suffix = missingList.length > 0 ? ` (${missingList.join(", ")})` : "";
  return `Google OAuth returned limited scopes${suffix}. Use Capture Local Session for full Antigravity 2.0 permissions.`;
}

export async function resolveBrowserOAuthProfile(tokenJson: any, accessToken: string) {
  const idProfile = decodeJwtProfile(tokenJson.id_token);
  let email: string | undefined = tokenJson.email || idProfile?.email || undefined;
  let profileUrl: string | undefined = tokenJson.picture || idProfile?.picture || undefined;
  let displayName: string | undefined =
    (typeof tokenJson.name === "string" ? tokenJson.name.trim() : "") ||
    idProfile?.name?.trim() ||
    undefined;

  if (!email || !profileUrl || !displayName) {
    try {
      const userInfo = await fetchGoogleUserInfo(accessToken);
      if (userInfo) {
        if (userInfo.email && !email) email = userInfo.email;
        if (userInfo.picture && !profileUrl) profileUrl = userInfo.picture;
        if (userInfo.name && !displayName) displayName = userInfo.name.trim() || undefined;
      }
    } catch (e) {
      console.error("Failed to fetch Google UserInfo:", e);
    }
  }

  return { email, profileUrl, displayName };
}
