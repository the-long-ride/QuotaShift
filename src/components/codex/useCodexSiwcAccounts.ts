import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CodexAccount } from "../../utils/common/types";
import type { SiwcAccountView, SiwcSignInStatus } from "../../utils/codex/siwc-types";
import { startCodexSiwcAuthorization } from "../../utils/codex/codex-siwc-link";

export function useCodexSiwcAccounts(enabled: boolean) {
  const [siwcAccounts, setSiwcAccounts] = useState<SiwcAccountView[]>([]);
  const [startingAccountId, setStartingAccountId] = useState<string | null>(null);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [signInPending, setSignInPending] = useState(false);
  const [siwcFeedback, setSiwcFeedback] = useState("");
  const [siwcError, setSiwcError] = useState("");

  const refreshSiwcAccounts = useCallback(async () => {
    try {
      const [accounts, status] = await Promise.all([
        invoke<SiwcAccountView[]>("list_siwc_accounts"),
        invoke<SiwcSignInStatus>("get_siwc_sign_in_status").catch(() => ({
          pending: false,
          linkedCodexAccountId: null,
          lastError: null,
        })),
      ]);
      setSiwcAccounts(accounts);
      const isPending = Boolean(status?.pending);
      setSignInPending(isPending);
      setPendingAccountId(isPending ? (status?.linkedCodexAccountId ?? null) : null);
      if (!isPending && status?.lastError) {
        setSiwcError(status.lastError);
        setSiwcFeedback("");
      }
    } catch {
      // Preserve last-known status; the explicit authorization action reports failures.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refreshSiwcAccounts();
    const interval = setInterval(() => void refreshSiwcAccounts(), 4000);
    return () => clearInterval(interval);
  }, [enabled, refreshSiwcAccounts]);

  const authorizeSiwcAccount = useCallback(
    async (account: CodexAccount) => {
      setStartingAccountId(account.id);
      setSiwcError("");
      setSiwcFeedback("");
      try {
        const result = await startCodexSiwcAuthorization(account, true, "open");
        if (result === "started") {
          setPendingAccountId(account.id);
          setSignInPending(true);
          setSiwcFeedback(
            `Complete Model Routing consent for ${account.label} in your browser. Use the same ChatGPT account and workspace.`,
          );
        } else {
          setSiwcFeedback(`Model Routing is already authorized for ${account.label}.`);
        }
        await refreshSiwcAccounts();
      } catch (error) {
        setSiwcError(`Model Routing authorization could not start: ${String(error)}`);
      } finally {
        setStartingAccountId(null);
      }
    },
    [refreshSiwcAccounts],
  );

  const copySiwcAccountLink = useCallback(
    async (account: CodexAccount) => {
      setStartingAccountId(account.id);
      setSiwcError("");
      setSiwcFeedback("");
      try {
        const result = await startCodexSiwcAuthorization(account, true, "copy");
        if (result === "copied") {
          setPendingAccountId(account.id);
          setSignInPending(true);
          setSiwcFeedback(
            `✓ Authorization link copied for ${account.label}. Paste in your browser and use the same ChatGPT account and workspace.`,
          );
        } else {
          setSiwcFeedback(`Model Routing is already authorized for ${account.label}.`);
        }
        await refreshSiwcAccounts();
      } catch (error) {
        setSiwcError(`Could not copy Model Routing authorization link: ${String(error)}`);
      } finally {
        setStartingAccountId(null);
      }
    },
    [refreshSiwcAccounts],
  );

  const cancelSiwcAccountLogin = useCallback(async () => {
    setSiwcError("");
    try {
      await invoke("cancel_siwc_sign_in");
      setStartingAccountId(null);
      setPendingAccountId(null);
      setSignInPending(false);
      setSiwcFeedback("Model Routing authorization canceled.");
      await refreshSiwcAccounts();
    } catch (error) {
      setSiwcError(`Could not cancel Model Routing authorization: ${String(error)}`);
    }
  }, [refreshSiwcAccounts]);

  const busyAccountId = startingAccountId ?? pendingAccountId;
  const isAnySiwcBusy = Boolean(busyAccountId) || signInPending;

  return {
    siwcAccounts,
    authorizeSiwcAccount,
    copySiwcAccountLink,
    cancelSiwcAccountLogin,
    busyAccountId,
    isAnySiwcBusy,
    siwcFeedback,
    siwcError,
  };
}
