import {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  FullStatus,
  LocalAntigravitySession,
} from "../../utils/common/types";

export interface AntigravityTabBaseProps {
  accounts: AntigravityAccount[];
  activeId: string | null;
  appliedId: string | null;
  trackedProvider?: "antigravity" | "codex" | "claude";
  lastFullStatus: FullStatus | null;
  localSession?: Partial<LocalAntigravitySession> | null;
  antigravityUsageCache: Record<string, AntigravityUsageCacheEntry>;
  onApply: (acc: AntigravityAccount) => Promise<void>;
  onDelete: (acc: AntigravityAccount) => Promise<void>;
  onRename: (acc: AntigravityAccount, newLabel: string) => void;
  onTrack: (acc: AntigravityAccount) => void;
  onRefreshQuota: (acc: AntigravityAccount) => void;
  onSwitchBest: () => void;
  onReorder: (orderedIds: string[]) => void;
  onAddAccountClick: () => void;
  onTrackCurrentAccount?: () => void | Promise<void>;
  isTrackingCurrentAccount?: boolean;
  searchQuery?: string;
}
