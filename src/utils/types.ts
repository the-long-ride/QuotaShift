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
}

export interface CodexAccount {
  id: string;
  label: string;
  apiKey: string; // obfuscated in storage
  lastPlan?: string;
  lastResets?: string;
  email?: string;
  lastUsedAt?: number;
  profileUrl?: string;
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

export type CodexModelSelectionMode = "discovered" | "manual";

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
  CodexRouterStatus,
  CodexRouterQuotaWindow,
  CodexRouterAuth,
  CodexRouterAccountConfig,
  CodexRouterPoolConfig,
  CodexRouterConfig,
  CodexAccountPool,
  CodexPoolLaneCapacity,
  CodexPoolCapacity,
} from "./codex-router-types";

export type AntigravityModelFamily = "gemini" | "claude" | "open_ai" | "other";

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
}

export interface AntigravityAccount {
  id: string;
  label: string;
  token: string; // obfuscated in storage
  refreshToken?: string; // obfuscated in storage
  profileUrl?: string; // obfuscated in storage
  lastPlan?: string;
  lastBalance?: string;
  quotas?: QuotaData[];
  cloudQuotas?: AntigravityModelQuota[];
  email?: string;
  lastUsedAt?: number;
  lastQuotaFetchedAt?: number; // unix ms of last successful direct cloud quota fetch
  authMethod?: string;
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

export type AntigravityQuotaCacheSource = "exact" | "cached_exact" | "cloud_fallback" | "cloud";

export interface AntigravityUsageCacheEntry {
  loading?: boolean;
  exactState?: AntigravityExactState;
  workerMessage?: string;
  quotas?: QuotaData[];
  cloudQuotas?: AntigravityModelQuota[];
  planTier?: string | null;
  email?: string | null;
  credits?: CreditInfo | null;
  source?: AntigravityQuotaCacheSource;
  accuracy?: AntigravityQuotaAccuracy;
  fetchedAt?: number;
  lastExactFetchedAt?: number;
  error?: string;
}

export type ClaudeMonitorSource = "statusLine" | "localTranscript" | "none";

export interface ClaudeObservedUsageWindow {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  processedTokens: number;
}

export interface ClaudeObservedUsage {
  fiveHour: ClaudeObservedUsageWindow;
  sevenDay: ClaudeObservedUsageWindow;
  capturedAtMs: number;
}
export interface ClaudeRateLimitWindow {
  usedPercentage: number | null;
  resetsAt: number | null;
}

export interface ClaudeSessionSnapshot {
  sessionId: string;
  sessionName: string | null;
  modelId: string | null;
  modelDisplayName: string | null;
  claudeCodeVersion: string | null;
  currentDir: string | null;
  projectDir: string | null;
  capturedAtMs: number;
  totalCostUsd: number | null;
  totalDurationMs: number | null;
  totalApiDurationMs: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  contextWindowSize: number | null;
  contextUsedPercentage: number | null;
  contextRemainingPercentage: number | null;
  currentInputTokens: number | null;
  currentOutputTokens: number | null;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
  fiveHour: ClaudeRateLimitWindow | null;
  sevenDay: ClaudeRateLimitWindow | null;
}

export interface ClaudeMonitorStatus {
  installed: boolean;
  settingsPath: string | null;
  source: ClaudeMonitorSource;
  session: ClaudeSessionSnapshot | null;
  localUsage: ClaudeObservedUsage | null;
  error: string | null;
}
