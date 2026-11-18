import { useEffect, useRef } from "react";
import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  CodexAccount,
} from "../../utils/common/types";
import { loadAntigravityAccounts, loadCodexAccounts } from "../../utils/common/backup/app-storage";
import { ANTIGRAVITY_KEEP_ALIVE_UPDATED_EVENT } from "../../utils/antigravity/antigravity-keep-alive";
import { CODEX_KEEP_ALIVE_UPDATED_EVENT } from "../../utils/codex/account/codex-keep-alive";
import type { PlatformVisibility } from "../../utils/common/ui/platform-visibility";

export interface UseKeepAliveStateSyncParams {
  setAntigravityAccounts: React.Dispatch<React.SetStateAction<AntigravityAccount[]>>;
  setCodexAccounts: React.Dispatch<React.SetStateAction<CodexAccount[]>>;
  antigravityUsageCacheRef: React.MutableRefObject<Record<string, AntigravityUsageCacheEntry>>;
  setAntigravityUsageCache: React.Dispatch<
    React.SetStateAction<Record<string, AntigravityUsageCacheEntry>>
  >;
  codexUsageCacheRef: React.MutableRefObject<Record<string, any>>;
  setCodexUsageCache: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  refreshAntigravityAccountsCloudFirst: (
    accs?: AntigravityAccount[],
    force?: boolean,
  ) => Promise<void>;
  fetchAccountUsage: (acc: CodexAccount, force?: boolean) => Promise<any>;
  platformVisibility: PlatformVisibility;
}

function clearCachedError<T extends { error?: unknown }>(
  cacheRef: React.MutableRefObject<Record<string, T>>,
  setCache: React.Dispatch<React.SetStateAction<Record<string, T>>>,
  accountId: string,
): boolean {
  const prior = cacheRef.current[accountId];
  if (!prior?.error) return false;
  cacheRef.current = { ...cacheRef.current, [accountId]: { ...prior, error: undefined } };
  setCache((prev) => ({
    ...prev,
    [accountId]: { ...prev[accountId], error: undefined },
  }));
  return true;
}

/** Keeps React account state and error banners in sync when background keep-alive refreshes tokens. */
export function useKeepAliveStateSync(params: UseKeepAliveStateSyncParams): void {
  const latestRef = useRef(params);
  latestRef.current = params;

  useEffect(() => {
    const handleAntigravityUpdated = (event: Event) => {
      const accountId = (event as CustomEvent<{ accountId?: string }>)?.detail?.accountId;
      if (!accountId) return;
      const fresh = loadAntigravityAccounts().find((acc) => acc.id === accountId);
      if (!fresh) return;

      const cur = latestRef.current;
      cur.setAntigravityAccounts((prev) =>
        prev.map((item) =>
          item.id === accountId
            ? {
                ...item,
                token: fresh.token,
                refreshToken: fresh.refreshToken ?? item.refreshToken,
                authMethod: fresh.authMethod ?? item.authMethod,
                email: fresh.email ?? item.email,
              }
            : item,
        ),
      );

      if (
        clearCachedError(cur.antigravityUsageCacheRef, cur.setAntigravityUsageCache, accountId) &&
        cur.platformVisibility.antigravity
      ) {
        void cur.refreshAntigravityAccountsCloudFirst([fresh], true).catch(console.warn);
      }
    };

    const handleCodexUpdated = (event: Event) => {
      const accountId = (event as CustomEvent<{ accountId?: string }>)?.detail?.accountId;
      if (!accountId) return;
      const fresh = loadCodexAccounts().find((acc) => acc.id === accountId);
      if (!fresh) return;

      const cur = latestRef.current;
      cur.setCodexAccounts((prev) =>
        prev.map((item) =>
          item.id === accountId
            ? { ...item, apiKey: fresh.apiKey, email: fresh.email ?? item.email }
            : item,
        ),
      );

      if (
        clearCachedError(cur.codexUsageCacheRef, cur.setCodexUsageCache, accountId) &&
        cur.platformVisibility.codex
      ) {
        void cur.fetchAccountUsage(fresh, true).catch(console.warn);
      }
    };

    window.addEventListener(ANTIGRAVITY_KEEP_ALIVE_UPDATED_EVENT, handleAntigravityUpdated);
    window.addEventListener(CODEX_KEEP_ALIVE_UPDATED_EVENT, handleCodexUpdated);
    return () => {
      window.removeEventListener(ANTIGRAVITY_KEEP_ALIVE_UPDATED_EVENT, handleAntigravityUpdated);
      window.removeEventListener(CODEX_KEEP_ALIVE_UPDATED_EVENT, handleCodexUpdated);
    };
  }, []);
}
