export type CodexModelSelectionMode = "discovered" | "manual";

export interface CodexRouterStatus {
  running: boolean;
  baseUrl: string | null;
  lastRoutedAccountId: string | null;
  lastRoutedModel: string | null;
  routedRequestCount: number;
  clientCoverage: Record<string, string>;
}

export interface CodexRouterQuotaWindow {
  remainingPercent: number;
  durationMinutes: number | null;
}

export type CodexRouterAuth =
  | { kind: "oAuth"; accessToken: string; refreshToken: string | null; chatgptAccountId: string }
  | { kind: "apiKey"; apiKey: string };

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
  activatedAt: number;
}

export interface CodexRouterConfig {
  accounts: CodexRouterAccountConfig[];
  pools: CodexRouterPoolConfig[];
  appliedAccountId: string | null;
}

export interface CodexAccountPool {
  id: string;
  name: string;
  model: string;
  accountIds: string[];
  autoSwitch: boolean;
  modelSelectionMode?: CodexModelSelectionMode;
  activatedAt?: number;
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
