import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CodexAccount, CodexModelCatalogCacheEntry } from "../../utils/common/types";
import { deobfuscate, obfuscate } from "../../utils/auth/auth";
import { isCodexModelCacheFresh, normalizeCodexModelCatalog } from "../../utils";
import {
  loadCodexModelCache,
  saveCodexModelCache,
  loadCodexAccounts,
  saveCodexAccounts,
} from "../../utils/common/app-storage";
import type { ToastKind } from "../../components/common/Toast";

export const CODEX_MODEL_CATALOG_STORAGE_KEY = "quotashift_codex_model_catalog_v1";

export interface UseCodexModelScanManagerParams {
  codexAccounts: CodexAccount[];
  showToast: (message: string, kind?: ToastKind) => void;
}

export function useCodexModelScanManager({
  codexAccounts,
  showToast,
}: UseCodexModelScanManagerParams) {
  const [codexModelCache, setCodexModelCache] = useState<
    Record<string, CodexModelCatalogCacheEntry>
  >(() => loadCodexModelCache());

  const codexModelCacheRef = useRef(codexModelCache);
  codexModelCacheRef.current = codexModelCache;

  const [codexModelScanProgress, setCodexModelScanProgress] = useState({
    running: false,
    total: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
  });

  const fetchCodexModelCatalog = async (
    account: CodexAccount,
    force = false,
    isRetry = false,
  ): Promise<CodexModelCatalogCacheEntry> => {
    const previousEntry = codexModelCacheRef.current[account.id];
    if (!force && isCodexModelCacheFresh(previousEntry)) return previousEntry!;
    const rawKey = deobfuscate(account.apiKey);
    if (!rawKey.startsWith("{")) {
      const entry: CodexModelCatalogCacheEntry = {
        accountId: account.id,
        planName: account.lastPlan ?? null,
        models: previousEntry?.models ?? [],
        fetchedAt: previousEntry?.fetchedAt ?? 0,
        error: "API-key accounts do not expose an account-scoped Codex model catalog",
      };
      saveCodexModelCache({ ...codexModelCacheRef.current, [account.id]: entry });
      setCodexModelCache((p) => ({ ...p, [account.id]: entry }));
      return entry;
    }
    const oauthData = JSON.parse(rawKey);
    try {
      const rawCatalog = await invoke<any>("fetch_chatgpt_models", {
        accessToken: oauthData.accessToken,
        accountId: oauthData.accountId,
        clientVersion: null,
      });
      const entry: CodexModelCatalogCacheEntry = {
        accountId: account.id,
        planName: account.lastPlan ?? null,
        models: normalizeCodexModelCatalog(rawCatalog),
        fetchedAt: Date.now(),
      };
      saveCodexModelCache({ ...codexModelCacheRef.current, [account.id]: entry });
      setCodexModelCache((p) => ({ ...p, [account.id]: entry }));
      return entry;
    } catch (error) {
      if (!isRetry && oauthData.refreshToken) {
        try {
          const tok = await invoke<any>("refresh_chatgpt_token", {
            refreshToken: oauthData.refreshToken,
          });
          oauthData.accessToken = tok.access_token;
          account.apiKey = obfuscate(JSON.stringify(oauthData));
          saveCodexAccounts(
            loadCodexAccounts().map((a) =>
              a.id === account.id ? { ...a, apiKey: account.apiKey } : a,
            ),
          );
          return await fetchCodexModelCatalog(account, true, true);
        } catch {}
      }
      const errMsg = String(error);
      const entry: CodexModelCatalogCacheEntry = {
        accountId: account.id,
        planName: account.lastPlan ?? null,
        models: previousEntry?.models ?? [],
        fetchedAt: previousEntry?.fetchedAt ?? 0,
        error: errMsg,
      };
      saveCodexModelCache({ ...codexModelCacheRef.current, [account.id]: entry });
      setCodexModelCache((p) => ({ ...p, [account.id]: entry }));
      return entry;
    }
  };

  const rescanAllCodexModels = async () => {
    const oauthAccounts = codexAccounts.filter((a) => {
      try {
        return deobfuscate(a.apiKey).startsWith("{");
      } catch {
        return false;
      }
    });
    let completed = 0;
    let failed = 0;
    for (let i = 0; i < oauthAccounts.length; i += 3) {
      const batch = oauthAccounts.slice(i, i + 3);
      const res = await Promise.all(batch.map((a) => fetchCodexModelCatalog(a, true)));
      completed += res.length;
      failed += res.filter((r) => r.error).length;
      setCodexModelScanProgress({
        running: true,
        total: oauthAccounts.length,
        completed,
        succeeded: completed - failed,
        failed,
      });
    }
    const result = {
      completed,
      failed,
      total: oauthAccounts.length,
      succeeded: completed - failed,
    };
    setCodexModelScanProgress({ running: false, ...result });
    return result;
  };

  const handleRescanAllCodexModels = async () => {
    const result = await rescanAllCodexModels();
    showToast(`Model scan: ${result.completed} scanned, ${result.failed} failed`);
  };

  return {
    codexModelCache,
    setCodexModelCache,
    codexModelCacheRef,
    codexModelScanProgress,
    fetchCodexModelCatalog,
    rescanAllCodexModels,
    handleRescanAllCodexModels,
  };
}
