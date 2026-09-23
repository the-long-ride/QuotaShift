import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ToastKind } from "../../components/common/Toast";
import type { ClaudeAccountUsageStatus } from "../../utils/common/types";
import {
  loadClaudePreferences,
  normalizeClaudePreferences,
  saveClaudePreferences,
} from "../../utils/common/claude-preferences";
import { claudeAdaptivePollIntervalSecs } from "../../utils/claude/claude-polling";
import { claudeAccountGuardrailDecision } from "../../utils/claude/claude-guardrails";
import { notifyClaudeGuardrailSuspension } from "../../utils/claude/claude-guardrail-notification";
import { useClaudeProfilePaths } from "./useClaudeProfilePaths";
import { useClaudeCurrentAccountResolver } from "./useClaudeCurrentAccountResolver";
import { useClaudeAccountRefresh } from "./useClaudeAccountRefresh";
import { useClaudeAccountResume } from "./useClaudeAccountResume";
import { useClaudeAccountOrdering } from "./useClaudeAccountOrdering";

type ShowToast = (message: string, kind?: ToastKind) => void;

type ClaudeProcessSuspendResult = {
  totalSuspended: number;
  alreadySuspended: number;
  persistenceError: string | null;
};

export function useClaudeAccountMonitor(
  showToast: ShowToast,
  platformVisible: boolean,
  guardrailsActive: boolean,
  pollIntervalSecs: number,
  idlePollIntervalSecs: number,
  monitoredAccountId: string | null = null,
  onlyWatchProcessingAccounts = true,
) {
  const [accountStatuses, setAccountStatuses] = useState<ClaudeAccountUsageStatus[]>([]);
  const accountStatusesRef = useRef(accountStatuses);
  accountStatusesRef.current = accountStatuses;
  const { setStatuses, handleReorderClaudeAccounts } = useClaudeAccountOrdering(
    accountStatusesRef,
    setAccountStatuses,
  );
  const { manualProfilePaths, manualProfilePathsRef, addProfilePath } = useClaudeProfilePaths(
    showToast,
    setStatuses,
  );

  const lastSuspendAttemptRef = useRef(new Map<string, number>());
  const guardrailFiringRef = useRef(false);

  const requestStatuses = useCallback(
    async (
      force = false,
      maxAgeSecs = pollIntervalSecs,
      refreshAccountId: string | null = null,
    ): Promise<ClaudeAccountUsageStatus[]> => {
      if (!platformVisible) return accountStatusesRef.current;
      await invoke("set_claude_features_enabled", { enabled: true });
      const statuses = await invoke<ClaudeAccountUsageStatus[]>("get_claude_account_statuses", {
        force,
        maxAgeSecs,
        idlePollIntervalSecs,
        extraConfigDirs: manualProfilePathsRef.current,
        guardrailsActive,
        monitoredAccountId,
        onlyWatchProcessingAccounts,
        refreshAccountId,
      });
      setStatuses(statuses);
      return statuses;
    },
    [
      guardrailsActive,
      idlePollIntervalSecs,
      monitoredAccountId,
      onlyWatchProcessingAccounts,
      platformVisible,
      pollIntervalSecs,
      setStatuses,
    ],
  );

  const refreshStatuses = useCallback(
    async (force = false) => requestStatuses(force, pollIntervalSecs),
    [pollIntervalSecs, requestStatuses],
  );

  const { isResolvingCurrentAccount, resolveCurrentAccount } = useClaudeCurrentAccountResolver(
    showToast,
    accountStatusesRef,
    manualProfilePathsRef,
    requestStatuses,
  );

  const reconcileGuardrails = useCallback(
    async (statuses: ClaudeAccountUsageStatus[]) => {
      if (!platformVisible || guardrailFiringRef.current) return;
      guardrailFiringRef.current = true;
      const preferences = normalizeClaudePreferences(loadClaudePreferences());
      let changed = false;

      for (const status of statuses) {
        const decision = claudeAccountGuardrailDecision(status, preferences);
        if (!decision.hit) continue;

        const now = Date.now();
        const lastAttempt = lastSuspendAttemptRef.current.get(status.account.id) ?? 0;
        if (now - lastAttempt < 30_000) continue;
        lastSuspendAttemptRef.current.set(status.account.id, now);

        try {
          const result = await invoke<ClaudeProcessSuspendResult>(
            "suspend_claude_account_processes",
            {
              configDir: status.account.configDir,
              autoResume: preferences.autoResumeAtReset,
              fiveHourTriggered: decision.fiveHourHit,
              fiveHourResetAt: decision.fiveHourHit ? (status.fiveHour?.resetsAt ?? null) : null,
              weeklyTriggered: decision.weeklyHit,
              weeklyResetAt: decision.weeklyHit ? (status.sevenDay?.resetsAt ?? null) : null,
            },
          );
          const fired = (result?.totalSuspended ?? 0) > 0 || (result?.alreadySuspended ?? 0) > 0;
          if (!fired) continue;

          changed = true;
          const guardrailsPersisted = saveClaudePreferences({
            ...preferences,
            enabled: false,
            fiveHour: { ...preferences.fiveHour, enabled: false },
            weekly: { ...preferences.weekly, enabled: false },
          });

          const canAutoResume =
            preferences.autoResumeAtReset &&
            !result.persistenceError &&
            (!decision.fiveHourHit || status.fiveHour?.resetsAt != null) &&
            (!decision.weeklyHit || status.sevenDay?.resetsAt != null);
          const persistenceWarning = result.persistenceError
            ? " Automatic resume state could not be saved; use Resume manually before restarting QuotaShift."
            : "";
          const guardrailStorageWarning = guardrailsPersisted
            ? ""
            : " Guardrails are off for this session, but the off state could not be saved for restart. Verify Claude guardrail settings before restarting QuotaShift.";
          const message =
            `QuotaShift suspended ${status.account.profileName} after the configured usage limit was reached. Claude Code guardrails are now off. Set them up again if needed.` +
            (canAutoResume
              ? " QuotaShift will resume the same suspended process after all triggered quota limits reset."
              : persistenceWarning) +
            guardrailStorageWarning;
          showToast(message, "warning");
          void notifyClaudeGuardrailSuspension(
            "Claude Code suspended by guardrails",
            message,
          ).catch(() => {});
          break;
        } catch (error) {
          showToast(
            `Failed to suspend Claude Code ${status.account.profileName}: ${String(error)}`,
            "error",
          );
        }
      }

      if (changed) {
        await requestStatuses(false).catch(() => {});
      } else {
        guardrailFiringRef.current = false;
      }
    },
    [platformVisible, requestStatuses, showToast],
  );

  const resumeAccount = useClaudeAccountResume(platformVisible, requestStatuses, showToast);

  const { refreshingAccountIds, refreshAccountUsage } = useClaudeAccountRefresh(
    platformVisible,
    accountStatusesRef,
    requestStatuses,
    showToast,
  );

  useEffect(() => {
    if (guardrailsActive) {
      guardrailFiringRef.current = false;
    }
  }, [guardrailsActive]);

  useEffect(() => {
    if (!platformVisible) return;
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      let statuses: ClaudeAccountUsageStatus[] = [];
      try {
        statuses = await requestStatuses(false, pollIntervalSecs);
        if (cancelled) return;
        await reconcileGuardrails(statuses);
      } catch {}

      if (cancelled) return;
      const preferences = normalizeClaudePreferences(loadClaudePreferences());
      const nextPollSecs =
        !guardrailsActive && monitoredAccountId
          ? Math.max(5, pollIntervalSecs)
          : guardrailsActive || preferences.reduceLowUsageFrequency
            ? claudeAdaptivePollIntervalSecs(pollIntervalSecs, statuses, preferences)
            : Math.max(5, pollIntervalSecs);
      timer = window.setTimeout(tick, nextPollSecs * 1000);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [
    guardrailsActive,
    monitoredAccountId,
    platformVisible,
    pollIntervalSecs,
    reconcileGuardrails,
    requestStatuses,
  ]);

  useEffect(() => {
    if (!platformVisible) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void listen<string>("claude-account-usage-updated", () => {
      if (cancelled) return;
      void requestStatuses(false, pollIntervalSecs)
        .then((statuses) => reconcileGuardrails(statuses))
        .catch(() => {});
    }).then((dispose) => {
      if (cancelled) {
        dispose();
      } else {
        unlisten = dispose;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [platformVisible, pollIntervalSecs, reconcileGuardrails, requestStatuses]);

  return {
    claudeAccountStatuses: accountStatuses,
    claudeManualProfilePaths: manualProfilePaths,
    isResolvingCurrentClaudeAccount: isResolvingCurrentAccount,
    handleAddClaudeProfilePath: addProfilePath,
    handleResolveCurrentClaudeAccount: resolveCurrentAccount,
    handleResumeClaudeAccount: resumeAccount,
    refreshingClaudeAccountIds: refreshingAccountIds,
    refreshClaudeAccountUsage: refreshAccountUsage,
    refreshClaudeAccountStatuses: refreshStatuses,
    handleReorderClaudeAccounts,
  };
}
