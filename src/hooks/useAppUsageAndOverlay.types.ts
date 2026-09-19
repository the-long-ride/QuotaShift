import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  ClaudeAccountUsageStatus,
  CodexAccount,
  CodexAccountPool,
  FullStatus,
  LocalAntigravitySession,
} from "../utils/common/types";

export type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  ClaudeAccountUsageStatus,
  CodexAccount,
  CodexAccountPool,
  FullStatus,
  LocalAntigravitySession,
};

export interface UseAppUsageAndOverlayParams {
  antigravityAccounts: AntigravityAccount[];
  activeAntigravityId: string | null;
  codexAccounts: CodexAccount[];
  setCodexAccounts: (accs: CodexAccount[]) => void;
  activeCodexId: string | null;
  codexPools: CodexAccountPool[];
  activeCodexPoolId: string | null;
  claudeMonitorStatus: any;
  claudeAccountStatuses: ClaudeAccountUsageStatus[];
  refreshClaudeAccountStatuses?: (force?: boolean) => Promise<ClaudeAccountUsageStatus[]>;
  lastFullStatus: FullStatus | null;
  refreshAntigravityAccountsCloudFirst: (
    accs?: AntigravityAccount[],
    force?: boolean,
    maxAgeMs?: number,
  ) => Promise<void>;
  handleApplyCodexAccount: (
    acc: CodexAccount,
    modelOverride?: string,
    poolId?: string,
    skipConfirm?: boolean,
  ) => Promise<void>;
  localAntigravitySession?: LocalAntigravitySession;
  refreshLocalSessionQuota?: () => Promise<any>;
  syncLocalSessionFromDisk?: (forceRefreshQuota?: boolean, maxAgeMs?: number) => Promise<void>;
}
