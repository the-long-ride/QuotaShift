import type { CodexModelPoolV2 } from "./codex-pools-v2-types";

export type CodexModelSelectionMode = "discovered" | "manual";

export interface CodexRouterStatus {
  running: boolean;
  baseUrl: string | null;
  port?: number | null;
  uptimeSecs?: number | null;
  inFlightRequests?: number;
  lastRoutedAccountId: string | null;
  lastRoutedModel: string | null;
  routedRequestCount: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCachedTokens?: number;
  totalReasoningTokens?: number;
  cacheHitRequests?: number;
  clientCoverage: Record<string, string>;
}

export interface CodexRouterQuotaWindow {
  remainingPercent: number;
  durationMinutes: number | null;
}

export type CodexRouterAuth =
  | { kind: "oAuth"; accessToken: string; refreshToken: string | null; chatgptAccountId: string }
  | { kind: "apiKey"; apiKey: string }
  | { kind: "siwc"; registrationId: string };

export interface CodexRouterAccountConfig {
  id: string;
  auth: CodexRouterAuth;
  availableModelIds: string[] | null;
  quotaWindows: CodexRouterQuotaWindow[];
  usageFetchedAt: number | null;
  modelCatalogFetchedAt: number | null;
}

export interface CodexRouterPoolConfig {
  id: string;
  model: string;
  accountIds: string[];
  modelSelectionMode: string;
}

export interface CodexRouterConfig {
  accounts: CodexRouterAccountConfig[];
  poolsV2?: CodexModelPoolV2[];
  pools: CodexRouterPoolConfig[];
  appliedAccountId: string | null;
  activePoolId: string | null;
}

export interface CodexAccountPool {
  id: string;
  name: string;
  model: string;
  accountIds: string[];
  modelSelectionMode?: CodexModelSelectionMode;
}

export interface CodexPoolLaneCapacity {
  remainingPoints: number;
  capacityPoints: number;
  knownMembers: number;
  totalMembers: number;
  nextResetAt: number | null;
}

export interface CodexPoolCapacity {
  primary: CodexPoolLaneCapacity;
  secondary: CodexPoolLaneCapacity;
  oauthMembers: number;
  apiKeyMembers: number;
}
