import type {
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
  CodexModelSelectionMode,
} from "../../utils/common/types";
import { validateCodexPoolModel } from "../../utils/codex/codex-models";

export interface CodexPoolModalProps {
  isOpen: boolean;
  accounts: CodexAccount[];
  initialPool: CodexAccountPool | null;
  modelCache?: Record<string, CodexModelCatalogCacheEntry>;
  onRequestModelScan?: (account: CodexAccount) => void;
  onClose: () => void;
  onSave: (pool: CodexAccountPool) => void;
}

export function getModelSelectionHint(mode: CodexModelSelectionMode): string {
  return mode === "discovered"
    ? "Discovered model: selected members must confirm support."
    : "Manual model: compatibility is advisory and Save remains available.";
}

export function getPoolMemberDetails(
  account: CodexAccount,
  model: string,
  modelSelectionMode: CodexModelSelectionMode,
  accounts: CodexAccount[],
  modelCache?: Record<string, CodexModelCatalogCacheEntry>,
) {
  const accountValidation = validateCodexPoolModel(
    model.trim(),
    modelSelectionMode,
    [account.id],
    accounts,
    modelCache ?? {},
  );
  const incompatibility = accountValidation.incompatibleAccountIds.includes(account.id);
  const compatibility = !model.trim()
    ? "Choose model"
    : incompatibility
      ? (accountValidation.reasons[account.id] ?? "Not supported")
      : modelSelectionMode === "discovered"
        ? "Supported"
        : "Manual";
  return { incompatibility, compatibility };
}

export function buildCodexPoolPayload(
  initialPool: CodexAccountPool | null,
  name: string,
  model: string,
  meta: { accountIds: string[]; modelSelectionMode: CodexModelSelectionMode },
): CodexAccountPool {
  return {
    id: initialPool?.id ?? `codex-pool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    model: model.trim(),
    accountIds: [...new Set(meta.accountIds)],
    modelSelectionMode: meta.modelSelectionMode,
  };
}
