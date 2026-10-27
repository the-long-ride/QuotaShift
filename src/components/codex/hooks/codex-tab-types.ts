import type { CodexModelPoolV2 } from "../../../utils/codex/pools/codex-pools-v2-types";
import {
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
  CodexRouterStatus,
  FullStatus,
} from "../../../utils/common/types";
import type { ToastKind } from "../../common/Toast";

export interface CodexTabBaseProps {
  accounts: CodexAccount[];
  pools?: CodexAccountPool[];
  modelPoolsV2?: CodexModelPoolV2[];
  onChangeModelPoolsV2?: (next: CodexModelPoolV2[]) => boolean;
  activePoolId?: string | null;
  activeId: string | null;
  appliedId: string | null;
  trackedProvider?: "antigravity" | "codex" | "claude" | null;
  lastFullStatus: FullStatus | null;
  codexUsageCache: Record<string, any>;
  codexModelCache?: Record<string, CodexModelCatalogCacheEntry>;
  onRescanModels?: (account: CodexAccount) => void | Promise<void>;
  onApply: (acc: CodexAccount) => void;
  onDelete: (acc: CodexAccount) => void;
  onRename: (acc: CodexAccount, newLabel: string) => void;
  onTrack: (acc: CodexAccount) => void;
  onSelect?: (acc: CodexAccount) => void;
  onRefresh?: (acc: CodexAccount) => void | Promise<void>;
  onSwitchBest: () => void;
  onReorder: (orderedIds: string[]) => void;
  onAddAccountClick: () => void;
  onReauthenticateAccount?: (acc: CodexAccount) => void;
  onNewPool?: () => void;
  onEditPool?: (pool: CodexAccountPool) => void;
  onDeletePool?: (pool: CodexAccountPool) => void;
  onActivatePool?: (pool: CodexAccountPool) => void;
  poolRoutingEnabled?: boolean;
  poolRoutingBusy?: boolean;
  routerStatus?: CodexRouterStatus | null;
  onTogglePoolRouting?: () => void;
  isTrackingCurrentAccount?: boolean;
  onTrackCurrentAccount?: () => void | Promise<void>;
  searchQuery?: string;
  codexModelRoutingEnabled?: boolean;
  showToast?: (message: string, kind?: ToastKind) => void;
}
