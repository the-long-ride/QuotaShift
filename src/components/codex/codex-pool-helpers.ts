import type {
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
  CodexModelSelectionMode,
} from "../../utils/common/types";
import type { CodexModelPoolV2 } from "../../utils/codex/codex-pools-v2-types";
import type { SiwcAccountView } from "../../utils/codex/siwc-types";
import { buildCodexTierModelGroups, validateCodexPoolModel } from "../../utils/codex/codex-models";

export const defaultPoolAuthMode = (
  siwcAccounts: SiwcAccountView[],
  accounts: CodexAccount[],
): CodexModelPoolV2["authMode"] =>
  siwcAccounts.some((a) => a.isRoutable) || accounts.every((a) => a.id.startsWith("acct-oauth-"))
    ? "siwc"
    : "openai-api-key";

export const freshPool = (
  siwcAccounts: SiwcAccountView[] = [],
  accounts: CodexAccount[] = [],
): CodexModelPoolV2 => ({
  id: `model-pool-${crypto.randomUUID()}`,
  displayName: "",
  publicModelName: "",
  upstreamModelId: "",
  enabled: false,
  memberAccountIds: [],
  modelSelectionMode: "manual",
  routingPolicy: "cache-aware",
  authMode: defaultPoolAuthMode(siwcAccounts, accounts),
  maxContextWindowTokens: 400_000,
  thinkingBudgetTokens: 8_192,
  reasoningEffort: "medium",
});

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

export function buildScannedModels(
  selectedAccounts: CodexAccount[],
  modelCache: Record<string, CodexModelCatalogCacheEntry>,
) {
  const seen = new Set<string>();
  return buildCodexTierModelGroups(selectedAccounts, modelCache)
    .flatMap((group) =>
      group.models.map(({ model, supportCount }) => ({
        id: model.id,
        label: model.displayName === model.id ? model.id : `${model.displayName} · ${model.id}`,
        tier: group.tier,
        supportCount,
      })),
    )
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
}

export function buildCompatibleAccounts(
  isSiwc: boolean,
  siwcAccounts: SiwcAccountView[],
  accounts: CodexAccount[],
) {
  if (!isSiwc) return accounts;
  return siwcAccounts
    .filter((account) => account.isRoutable)
    .map((account) => {
      const linked = accounts.find((a) => a.id === account.linkedCodexAccountId);
      const label = account.email || linked?.email || linked?.label || account.id;
      return {
        id: account.id,
        label,
        email: account.email || linked?.email,
        lastPlan: linked?.lastPlan || "SIWC",
      };
    });
}
