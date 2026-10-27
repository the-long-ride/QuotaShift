import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { AntigravityAccount, CodexAccount } from "../../utils/common/types";

export interface ApplyAccountRequestPayload {
  provider?: string;
  accountId?: string | null;
}

interface UseApplyAccountRequestParams {
  antigravityAccounts: AntigravityAccount[];
  codexAccounts: CodexAccount[];
  applyAntigravity: (acc: AntigravityAccount, skipConfirm?: boolean) => Promise<void>;
  applyCodex: (acc: CodexAccount, skipConfirm?: boolean) => Promise<void>;
}

/**
 * Applies an account to its local application when the overlay or taskbar menu asks for it
 * (`request-apply-account`). The click is the confirmation, so the apply dialog is skipped.
 */
export function useApplyAccountRequest(params: UseApplyAccountRequestParams) {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<ApplyAccountRequestPayload>("request-apply-account", (event) => {
      const { provider, accountId } = event.payload || {};
      if (!accountId) return;
      const current = paramsRef.current;
      if (provider === "antigravity") {
        const acc = current.antigravityAccounts.find((a) => a.id === accountId);
        if (acc) void current.applyAntigravity(acc, true);
      } else if (provider === "codex") {
        const acc = current.codexAccounts.find((a) => a.id === accountId);
        if (acc) void current.applyCodex(acc, true);
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
