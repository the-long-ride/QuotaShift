import type { CodexResetCreditsData } from "../codex/codex-reset-credits";

export interface QuotaData {
  model: string;
  percent: number;
  refreshTime: string;
  fiveHourPercent?: number;
  fiveHourReset?: string;
  fiveHourDisabled?: boolean;
  weeklyPercent?: number;
  weeklyReset?: string;
  weeklyDisabled?: boolean;
}

export interface CreditInfo {
  balance: number;
  creditType: string;
}

export interface CodexMonitoredInfo {
  accountId: string;
  label: string;
  primaryPercent: number | null;
  primaryLabel: string;
  secondaryPercent: number | null;
  secondaryLabel: string;
}

export type AntigravityQuotaAccuracy =
  "exact_grouped" | "session_only" | "model_only" | "unavailable";

export type AntigravityQuotaSource = "app_local" | "agy_local" | "ide_local" | "oauth_remote";

export interface FullStatus {
  credits: CreditInfo | null;
  quotas: QuotaData[];
  planTier: string | null;
  recentlyUsedModel: string | null;
  monitoredCodex: CodexMonitoredInfo | null;
  email?: string | null;
  online?: boolean;
  source?: AntigravityQuotaSource;
  accuracy?: AntigravityQuotaAccuracy;
  premiumModels?: string[] | null;
}

export interface CodexAccount {
  id: string;
  label: string;
  apiKey: string; // obfuscated in storage
  lastPlan?: string;
  lastResets?: string;
  resetCredits?: CodexResetCreditsData;
  email?: string;
  lastUsedAt?: number;
  profileUrl?: string;
  profileType?: "personal" | "workspace";
  workspaceName?: string;
}

export interface CodexAvailableModel {
  id: string;
  displayName: string;
  visibility?: string | null;
  supportedInApi?: boolean | null;
}

export interface CodexModelCatalogCacheEntry {
  accountId: string;
  planName: string | null;
  models: CodexAvailableModel[];
  fetchedAt: number;
  error?: string;
}

export interface CodexTierModelGroup {
  tier: string;
  accountCount: number;
  scannedCount: number;
  failedCount: number;
  models: Array<{
    model: CodexAvailableModel;
    supportCount: number;
    supportedByAll: boolean;
  }>;
}

export interface CodexPoolModelValidation {
  canSave: boolean;
  warning: boolean;
  incompatibleAccountIds: string[];
  reasons: Record<string, string>;
}

export type {
  CodexModelSelectionMode,
  CodexRouterStatus,
  CodexRouterQuotaWindow,
  CodexRouterAuth,
  CodexRouterAccountConfig,
  CodexRouterPoolConfig,
  CodexRouterConfig,
  CodexAccountPool,
  CodexPoolLaneCapacity,
  CodexPoolCapacity,
} from "../codex/pools/codex-router-types";

export type AntigravityModelFamily = "gemini" | "claude" | "open_ai" | "argon" | "other";

export interface AntigravityModelQuota {
  modelId: string;
  displayName: string;
  family: AntigravityModelFamily;
  remainingFraction: number;
  remainingPercent: number;
  resetAt: string | null;
  fiveHourPercent?: number | null;
  fiveHourReset?: string | null;
  fiveHourDisabled?: boolean | null;
  weeklyPercent?: number | null;
  weeklyReset?: string | null;
  weeklyDisabled?: boolean | null;
  quotaCarried?: boolean; // historical display-only, never fresh rotation evidence
}

export interface AntigravityRefreshedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  authMethod?: string;
}

export interface AntigravityAccountUsage {
  planTier: string | null;
  quotas: AntigravityModelQuota[];
  source: "cloud_code";
  accuracy: AntigravityQuotaAccuracy;
  fetchedAt: string;
  warnings: string[];
  refreshedTokens: AntigravityRefreshedTokens | null;
  premiumModels?: string[] | null;
}

export interface AntigravityAccount {
  id: string;
  label: string;
  token: string; // obfuscated in storage
  refreshToken?: string; // obfuscated in storage
  tokenRefreshedAt?: number;
  profileUrl?: string; // obfuscated in storage
  lastPlan?: string;
  lastBalance?: string;
  quotas?: QuotaData[];
  cloudQuotas?: AntigravityModelQuota[];
  premiumModels?: string[] | null;
  email?: string;
  lastUsedAt?: number;
  lastQuotaFetchedAt?: number; // unix ms of last successful direct cloud quota fetch
  authMethod?: string;
  authSource?: "native_capture" | "browser_oauth";
}

export type AntigravityExactState =
  | "idle"
  | "preparing_profile"
  | "starting_worker"
  | "waiting_for_language_server"
  | "reading_exact_quota"
  | "exact"
  | "cached"
  | "cloud_fallback"
  | "stopping"
  | "error";

export interface LocalAntigravityCapturedAccount {
  token: string;
  refreshToken?: string;
  profileUrl?: string;
  email?: string;
  authMethod?: string;
}

export interface LocalAntigravitySession {
  email: string | null;
  planTier: string | null;
  credits: CreditInfo | null;
  quotas: QuotaData[];
  premiumModels?: string[] | null;
  source?: AntigravityQuotaSource;
  accuracy?: AntigravityQuotaAccuracy;
  online: boolean;
  lastSeenAt: number | null;
  capturedAccount?: LocalAntigravityCapturedAccount;
}

export interface ExactAntigravityAccountRequest {
  accountId: string;
  email: string;
  accessToken: string;
  refreshToken: string | null;
  profileUrl: string | null;
  authMethod: string | null;
}

export interface ExactAntigravityAccountResult {
  accountId: string;
  state: AntigravityExactState;
  status: FullStatus | null;
  error: string | null;
  fetchedAt: string;
}

export interface AntigravityWorkerProgress {
  accountId: string;
  phase: AntigravityExactState;
  message: string;
  timestamp: string;
}

export type AntigravityQuotaCacheSource =
  "exact" | "cached_exact" | "cloud_fallback" | "cloud" | "ide_local";

export interface AntigravityUsageCacheEntry {
  loading?: boolean;
  exactState?: AntigravityExactState;
  workerMessage?: string;
  quotas?: QuotaData[];
  cloudQuotas?: AntigravityModelQuota[];
  planTier?: string | null;
  premiumModels?: string[] | null;
  email?: string | null;
  credits?: CreditInfo | null;
  source?: AntigravityQuotaCacheSource;
  accuracy?: AntigravityQuotaAccuracy;
  fetchedAt?: number;
  lastExactFetchedAt?: number;
  error?: string;
}

export type {
  ClaudeMonitorSource,
  ClaudeObservedUsageWindow,
  ClaudeObservedUsage,
  ClaudeRateLimitWindow,
  ClaudeSessionSnapshot,
  ClaudeMonitorStatus,
} from "../claude/claude-monitor-types";

export type { ClaudeAccount, ClaudeAccountUsageStatus } from "../claude/claude-account-types";
export type {
  CodexModelPoolV2,
  PoolRoutingPolicy,
  PoolAuthMode,
  PoolRegistryMutation,
  PoolRegistryStateV2,
} from "../codex/pools/codex-pools-v2-types.js";
