import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  CodexAccount,
  FullStatus,
} from "../../utils/common/types";
import type { PlatformId, PlatformVisibility } from "../../utils/common/platform-visibility";

export interface UseAppEventListenersParams {
  setActiveTab: (tab: PlatformId) => void;
  platformVisibility: PlatformVisibility;
  setAntigravityUsageCache: React.Dispatch<
    React.SetStateAction<Record<string, AntigravityUsageCacheEntry>>
  >;
  setLastFullStatus: (status: FullStatus | null) => void;
  updateLocalSessionFromStatus: (status: FullStatus) => void;
  fetchAccountUsage: (account: CodexAccount) => Promise<any>;
  refreshAntigravityAccountsCloudFirst: (
    accounts: AntigravityAccount[],
    force?: boolean,
  ) => Promise<any>;
  refreshTrackedAccountOnly: (payload: any) => Promise<void>;
  setAntigravityAccounts: (accounts: AntigravityAccount[]) => void;
  setCodexAccounts: (accounts: CodexAccount[]) => void;
  pollInterval: number;
  idlePollInterval: number;
  onClearSearch?: () => void;
}
