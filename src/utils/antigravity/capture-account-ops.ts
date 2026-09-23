import type { AntigravityAccount } from "../common/types";
import { importCapturedAntigravityAccounts } from "./capture-import.js";
import { findAntigravityAccountMatch } from "../account/current-account.js";
import type { AccountCaptureCounts } from "../account/capture-completion.js";

export interface CaptureAccountOps {
  loadAccounts: () => AntigravityAccount[];
  saveAccounts: (accounts: AntigravityAccount[]) => void;
  setActiveAccountId: (id: string) => void;
  onAccountAdded: (accountId: string) => void | Promise<void>;
  onLocalSessionCaptured: (account: AntigravityAccount) => void;
  onCaptureSucceeded: (counts: AccountCaptureCounts) => void;
}

export function createCapturedAntigravityAccountHandler(ops: CaptureAccountOps) {
  return async (
    candidates: AntigravityAccount[],
    currentAccount: AntigravityAccount,
  ): Promise<number> => {
    const result = importCapturedAntigravityAccounts(ops.loadAccounts(), candidates);
    if (result.added.length > 0) {
      ops.saveAccounts(result.accounts);
      for (const account of result.added) {
        try {
          await ops.onAccountAdded(account.id);
        } catch {
          // Saving the account must not depend on a successful usage refresh.
        }
      }
    }
    const currentSaved = findAntigravityAccountMatch(result.accounts, currentAccount);
    if (currentSaved) ops.setActiveAccountId(currentSaved.id);
    ops.onLocalSessionCaptured(currentAccount);
    ops.onCaptureSucceeded({
      addedCount: result.added.length,
      alreadyPresentCount: result.unique.length - result.added.length,
    });
    return result.added.length;
  };
}
