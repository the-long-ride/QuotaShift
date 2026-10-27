export type PoolRoutingPolicy = "cache-aware" | "balanced" | "priority";
export type PoolAuthMode = "siwc" | "openai-api-key";
export type PoolReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface CodexModelPoolV2 {
  id: string;
  displayName: string;
  publicModelName: string;
  upstreamModelId: string;
  enabled: boolean;
  memberAccountIds: string[];
  modelSelectionMode: "manual" | "discovered";
  routingPolicy: PoolRoutingPolicy;
  authMode: PoolAuthMode;
  maxContextWindowTokens?: number;
  thinkingBudgetTokens?: number;
  reasoningEffort?: PoolReasoningEffort;
}

export type PoolRegistryMutation =
  | { kind: "replace"; expectedRevision: number; pools: CodexModelPoolV2[] }
  | { kind: "setEnabled"; expectedRevision: number; poolId: string; enabled: boolean };

export interface PoolRegistryStateV2 {
  revision: number;
  pools: CodexModelPoolV2[];
}

export interface PoolValidationResult {
  valid: boolean;
  error?: string;
}

export interface PoolMutationResult {
  success: boolean;
  revision: number;
  pools: CodexModelPoolV2[];
  error?: string;
}

export interface KnownAccountLike {
  id: string;
  authMode?: string;
  apiKey?: string;
}

export interface MigrationResultV2 {
  pools: CodexModelPoolV2[];
  diagnostics: string[];
}
