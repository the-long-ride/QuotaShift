import { useMemo } from "react";
import { AntigravityAccount, LocalAntigravitySession } from "../../utils/common/types";
import {
  findAntigravityAccountMatch,
  normalizeAccountIdentity,
} from "../../utils/account/current-account";

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
