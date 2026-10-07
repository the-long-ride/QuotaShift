import type React from "react";
import type {
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
} from "../../utils/common/types";
import type { ToastKind } from "../../components/common/Toast";

export interface UseCodexAccountOpsParams {
  codexAccounts: CodexAccount[];
  setCodexAccounts: (accs: CodexAccount[]) => void;
  activeCodexId: string | null;
  setActiveCodexId: (id: string | null) => void;
  codexPools: CodexAccountPool[];
  setCodexPools: (pools: CodexAccountPool[]) => void;
  codexPoolsRef: React.MutableRefObject<CodexAccountPool[]>;
  activeCodexPoolId: string | null;
  setActiveCodexPoolId: (id: string | null) => void;
  codexModelCacheRef: React.MutableRefObject<Record<string, CodexModelCatalogCacheEntry>>;
  setCodexModelCache: React.Dispatch<
    React.SetStateAction<Record<string, CodexModelCatalogCacheEntry>>
  >;
  fetchCodexModelCatalog: (account: CodexAccount, force?: boolean) => Promise<any>;
  codexUsageCache: Record<string, any>;
  showToast: (message: string, kind?: ToastKind) => void;
  syncTrackedIdentityState: (provider: "antigravity" | "codex" | "claude", id: string) => void;
  handleTrackCodexAccount: (acc: CodexAccount) => Promise<any>;
  setAccountPendingApply: React.Dispatch<
    React.SetStateAction<{
      title: string;
      message: string;
      onConfirm: () => Promise<void> | void;
    } | null>
  >;
  setAccountPendingDelete: React.Dispatch<
    React.SetStateAction<{
      name: string;
      email?: string | null;
      onConfirm: () => Promise<void> | void;
    } | null>
  >;
  setTrackingCurrentProvider: (val: "antigravity" | "codex" | null) => void;
}
