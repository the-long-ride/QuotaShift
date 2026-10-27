export type * from "./codex-pools-v2-types.js";
import type {
  CodexModelPoolV2,
  KnownAccountLike,
  PoolAuthMode,
  PoolMutationResult,
  PoolReasoningEffort,
  PoolRegistryMutation,
  PoolRegistryStateV2,
  PoolRoutingPolicy,
  PoolValidationResult,
} from "./codex-pools-v2-types.js";

const ALIAS_REGEX = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,95}$/;
const VALID_EFFORTS = new Set<PoolReasoningEffort>(["minimal", "low", "medium", "high", "xhigh"]);

export const DEFAULT_REASONING_EFFORT: PoolReasoningEffort = "medium";
export const DEFAULT_THINKING_BUDGET_TOKENS = 8_192;

export function defaultBudgetForEffort(effort: PoolReasoningEffort): number {
  switch (effort) {
    case "minimal":
      return 1_024;
    case "low":
      return 2_048;
    case "medium":
      return 8_192;
    case "high":
      return 16_384;
    case "xhigh":
      return 32_768;
  }
}

export function effortForThinkingBudget(budgetTokens: number): PoolReasoningEffort {
  if (budgetTokens < 1_024) return "minimal";
  if (budgetTokens < 4_096) return "low";
  if (budgetTokens < 16_384) return "medium";
  if (budgetTokens < 32_768) return "high";
  return "xhigh";
}

export function getDefaultModelLimits(upstreamModelId: string): {
  maxContextWindowTokens: number;
  thinkingBudgetTokens: number;
  reasoningEffort: PoolReasoningEffort;
} {
  const lower = upstreamModelId.trim().toLowerCase();
  let maxContextWindowTokens = 200_000;
  if (lower.startsWith("gpt-4.1")) {
    maxContextWindowTokens = 1_000_000;
  } else if (lower.startsWith("gpt-4")) {
    maxContextWindowTokens = 128_000;
  } else if (lower.startsWith("gpt-5") || lower.startsWith("gpt-6") || lower.startsWith("codex")) {
    maxContextWindowTokens = 400_000;
  }
  return {
    maxContextWindowTokens,
    thinkingBudgetTokens: DEFAULT_THINKING_BUDGET_TOKENS,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
  };
}

export function normalizeAlias(raw: string): string {
  return raw.trim();
}

import { deduplicateStrings } from "./codex-pools-v2-migration.js";
export {
  deduplicateStrings,
  inferAuthMode,
  migrateCodexPoolsV1,
} from "./codex-pools-v2-migration.js";

export function normalizeCodexModelPoolsV2(raw: unknown): CodexModelPoolV2[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const normalized: CodexModelPoolV2[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<CodexModelPoolV2>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const displayName =
      typeof candidate.displayName === "string" ? candidate.displayName.trim() : id;
    const publicModelName =
      typeof candidate.publicModelName === "string"
        ? normalizeAlias(candidate.publicModelName)
        : "";
    const upstreamModelId =
      typeof candidate.upstreamModelId === "string"
        ? candidate.upstreamModelId.trim()
        : publicModelName;
    const enabled = candidate.enabled === true;
    const rawMembers = Array.isArray(candidate.memberAccountIds)
      ? candidate.memberAccountIds.filter((m): m is string => typeof m === "string")
      : [];
    const memberAccountIds = deduplicateStrings(rawMembers);
    const modelSelectionMode =
      candidate.modelSelectionMode === "discovered" ? "discovered" : "manual";
    const routingPolicy: PoolRoutingPolicy =
      candidate.routingPolicy === "balanced" || candidate.routingPolicy === "priority"
        ? candidate.routingPolicy
        : "cache-aware";
    const authMode: PoolAuthMode =
      candidate.authMode === "openai-api-key" ? "openai-api-key" : "siwc";
    const resolvedUpstream = upstreamModelId || publicModelName;
    const defaults = getDefaultModelLimits(resolvedUpstream);
    const maxContextWindowTokens =
      typeof candidate.maxContextWindowTokens === "number" &&
      Number.isFinite(candidate.maxContextWindowTokens) &&
      candidate.maxContextWindowTokens >= 1_024
        ? Math.round(candidate.maxContextWindowTokens)
        : defaults.maxContextWindowTokens;
    const rawBudget =
      typeof candidate.thinkingBudgetTokens === "number" &&
      Number.isFinite(candidate.thinkingBudgetTokens) &&
      candidate.thinkingBudgetTokens >= 256
        ? Math.round(candidate.thinkingBudgetTokens)
        : undefined;
    const reasoningEffort: PoolReasoningEffort =
      typeof candidate.reasoningEffort === "string" &&
      VALID_EFFORTS.has(candidate.reasoningEffort as PoolReasoningEffort)
        ? (candidate.reasoningEffort as PoolReasoningEffort)
        : rawBudget !== undefined
          ? effortForThinkingBudget(rawBudget)
          : defaults.reasoningEffort;
    const thinkingBudgetTokens = rawBudget ?? defaultBudgetForEffort(reasoningEffort);

    normalized.push({
      id,
      displayName: displayName || id,
      publicModelName,
      upstreamModelId: resolvedUpstream,
      enabled,
      memberAccountIds,
      modelSelectionMode,
      routingPolicy,
      authMode,
      maxContextWindowTokens,
      thinkingBudgetTokens,
      reasoningEffort,
    });
  }
  return normalized;
}

export function validateEnabledPoolNames(
  pools: CodexModelPoolV2[],
  knownAccounts?: KnownAccountLike[],
): PoolValidationResult {
  const seenIds = new Set<string>();
  const enabledAliases = new Map<string, string>();
  const knownAccountMap = knownAccounts ? new Map(knownAccounts.map((a) => [a.id, a])) : null;

  for (const pool of pools) {
    if (seenIds.has(pool.id)) {
      return { valid: false, error: `Duplicate pool ID detected: ${pool.id}` };
    }
    seenIds.add(pool.id);

    if (!ALIAS_REGEX.test(pool.publicModelName)) {
      return {
        valid: false,
        error: `Pool '${pool.displayName}' has invalid alias format: '${pool.publicModelName}'`,
      };
    }

    if (pool.enabled) {
      if (pool.memberAccountIds.length === 0) {
        return {
          valid: false,
          error: `Enabled pool '${pool.displayName}' cannot have zero members`,
        };
      }
      const folded = pool.publicModelName.toLowerCase();
      if (enabledAliases.has(folded)) {
        return {
          valid: false,
          error: `Duplicate enabled public model alias: '${pool.publicModelName}' conflicts with '${enabledAliases.get(folded)}'`,
        };
      }
      enabledAliases.set(folded, pool.publicModelName);

      if (knownAccountMap) {
        for (const accountId of pool.memberAccountIds) {
          // Native SIWC registrations are not legacy Codex accounts. Their exact
          // registration and entitlement are verified in the Rust broker.
          if (pool.authMode === "siwc") {
            if (!/^reg_[A-Za-z0-9_-]{8,128}$/.test(accountId)) {
              return {
                valid: false,
                error: `SIWC pool '${pool.displayName}' references unknown account or invalid native ChatGPT registration: '${accountId}'`,
              };
            }
            continue;
          }
          if (!knownAccountMap.has(accountId)) {
            return {
              valid: false,
              error: `Enabled pool '${pool.displayName}' references unknown account: '${accountId}'`,
            };
          }
        }
      }
    }
  }

  return { valid: true };
}

export function applyPoolMutation(
  current: PoolRegistryStateV2,
  mutation: PoolRegistryMutation,
  knownAccounts?: KnownAccountLike[],
): PoolMutationResult {
  if (mutation.expectedRevision !== current.revision) {
    return {
      success: false,
      revision: current.revision,
      pools: current.pools,
      error: `Revision mismatch: expected ${mutation.expectedRevision}, got ${current.revision}`,
    };
  }

  let candidatePools: CodexModelPoolV2[];
  if (mutation.kind === "replace") {
    candidatePools = normalizeCodexModelPoolsV2(mutation.pools);
  } else if (mutation.kind === "setEnabled") {
    const target = current.pools.find((p) => p.id === mutation.poolId);
    if (!target) {
      return {
        success: false,
        revision: current.revision,
        pools: current.pools,
        error: `Pool with id '${mutation.poolId}' not found`,
      };
    }
    candidatePools = current.pools.map((p) =>
      p.id === mutation.poolId ? { ...p, enabled: mutation.enabled } : { ...p },
    );
  } else {
    return {
      success: false,
      revision: current.revision,
      pools: current.pools,
      error: "Unsupported mutation kind",
    };
  }

  const validation = validateEnabledPoolNames(candidatePools, knownAccounts);
  if (!validation.valid) {
    return {
      success: false,
      revision: current.revision,
      pools: current.pools,
      error: validation.error,
    };
  }

  return {
    success: true,
    revision: current.revision + 1,
    pools: candidatePools,
  };
}
