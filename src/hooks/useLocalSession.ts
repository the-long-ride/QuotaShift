import { useState } from "react";
import {
  AntigravityAccount,
  LocalAntigravitySession,
  FullStatus,
} from "../utils/types";
import {
  loadLocalAntigravitySession,
  saveLocalAntigravitySession,
  mergeLocalAntigravityStatus,
  canAddLocalSessionToMonitored,
} from "../utils/local-antigravity-session";
import { resolveAntigravityPlanName, ANTIGRAVITY_ORDER_KEY } from "../utils/app-constants";
import { saveAntigravityAccounts } from "../utils/app-storage";
import { saveAccountOrder } from "../utils/account-order";

export const useLocalSession = (
  antigravityAccounts: AntigravityAccount[],
  setAntigravityAccounts: React.Dispatch<React.SetStateAction<AntigravityAccount[]>>,
  refreshQuota: (accounts: AntigravityAccount[], force?: boolean) => Promise<any>,
) => {
  const [localAntigravitySession, setLocalAntigravitySession] = useState<LocalAntigravitySession>(() =>
    loadLocalAntigravitySession()
  );

  const updateLocalSessionFromStatus = (status: FullStatus | null) => {
    if (!status) return;
    setLocalAntigravitySession((prev) => {
      const next = mergeLocalAntigravityStatus(prev, status);
      saveLocalAntigravitySession(next);
      return next;
    });
  };

  const handleLocalAntigravitySessionCaptured = (captured: AntigravityAccount) => {
    setLocalAntigravitySession((previous) => {
      const next: LocalAntigravitySession = {
        ...previous,
        email: captured.email ?? previous.email,
        online: previous.online,
        capturedAccount: {
          token: captured.token,
          refreshToken: captured.refreshToken,
          profileUrl: captured.profileUrl,
          email: captured.email,
          authMethod: captured.authMethod,
        },
      };
      saveLocalAntigravitySession(next);
      return next;
    });
  };

  const handleAddLocalSessionToMonitored = () => {
    if (!canAddLocalSessionToMonitored(localAntigravitySession, antigravityAccounts)) return;
    const captured = localAntigravitySession.capturedAccount;
    if (!captured?.token) return;
    const email = (localAntigravitySession.email || captured.email || "").trim();
    const label = email ? email.split("@")[0] : "Local Antigravity";
    const newAccount: AntigravityAccount = {
      id: `ag-acct-${Date.now()}`,
      label,
      token: captured.token,
      refreshToken: captured.refreshToken,
      profileUrl: captured.profileUrl,
      email: email || undefined,
      authMethod: captured.authMethod,
      lastPlan: resolveAntigravityPlanName(localAntigravitySession.planTier) || undefined,
      lastBalance: localAntigravitySession.credits
        ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
            localAntigravitySession.credits.balance
          )
        : undefined,
      quotas: localAntigravitySession.quotas,
      lastUsedAt: localAntigravitySession.online
        ? localAntigravitySession.lastSeenAt ?? Date.now()
        : undefined,
    };
    const updated = [...antigravityAccounts, newAccount];
    saveAntigravityAccounts(updated);
    saveAccountOrder(ANTIGRAVITY_ORDER_KEY, updated.map((account) => account.id));
    setAntigravityAccounts(updated);
    void refreshQuota([newAccount], true);
  };

  return {
    localAntigravitySession,
    setLocalAntigravitySession,
    updateLocalSessionFromStatus,
    handleLocalAntigravitySessionCaptured,
    handleAddLocalSessionToMonitored,
  };
};
