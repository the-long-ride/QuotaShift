import type React from "react";
import type { ClaudeAccount, ClaudeAccountUsageStatus } from "../../utils/common/types";
import type { ClaudeResetCredits } from "../../utils/claude/claude-reset-credits";

export interface ClaudeCardReorderBindings {
  containerRef: React.RefObject<HTMLDivElement | null>;
  draggingId: string | null;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, id: string) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  consumeClickSuppression: () => boolean;
}

export interface ClaudeAccountCardsProps {
  accounts: ClaudeAccountUsageStatus[];
  resetCreditsByAccountId?: Readonly<Record<string, ClaudeResetCredits>>;
  trackedAccountId?: string | null;
  trackedAccountIds?: readonly string[];
  isClaudeTracked?: boolean;
  guardrailsActive?: boolean;
  onMonitor?: (status: ClaudeAccountUsageStatus) => void;
  refreshingAccountIds?: ReadonlySet<string>;
  onRefresh?: (accountId: string) => void | Promise<void>;
  onResume?: (configDir: string) => void;
  onRename?: (account: ClaudeAccount, newAlias: string) => void;
  onOpenResets?: (
    event: React.MouseEvent<HTMLButtonElement>,
    status: ClaudeAccountUsageStatus,
  ) => void;
  reorder?: ClaudeCardReorderBindings;
}
