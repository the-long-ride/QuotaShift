import type {
  CodexAccount,
  CodexAvailableModel,
  CodexModelCatalogCacheEntry,
  CodexModelPoolV2,
  CodexRouterStatus,
} from "../../src/utils/common/types";
import type { CodexResetCreditsData } from "../../src/utils/codex/codex-reset-credits";
import {
  buildCodexResetCredits,
  nudgeCodexCacheEntry,
  pickBestCodexAccount,
  refreshAllCodexCache,
} from "./demo-codex-helpers";

export { nudgeCodexCacheEntry, pickBestCodexAccount, refreshAllCodexCache };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MIN_MS = 60 * 1000;

export interface DemoCodexRateWindow {
  window_duration_mins: number;
  used_percent: number;
  reset_at: number;
}

export interface DemoCodexUsageCacheEntry {
  isOAuth: boolean;
  planName: string;
  loading?: boolean;
  error?: string;
  fetchedAt: number;
  resetCredits: CodexResetCreditsData;
  rate_limit: {
    primary_window: DemoCodexRateWindow;
    secondary_window: DemoCodexRateWindow;
    reset_credits: CodexResetCreditsData;
  };
}

const unixSec = (now: number, offsetMs: number): number => Math.floor((now + offsetMs) / 1000);

const DEMO_CODEX_MODELS: CodexAvailableModel[] = [
  { id: "gpt-5.3-codex", displayName: "GPT-5.3 Codex", visibility: "list", supportedInApi: true },
  { id: "codex-mini", displayName: "Codex Mini", visibility: "list", supportedInApi: true },
  { id: "gpt-5.2-codex", displayName: "GPT-5.2 Codex", visibility: "list", supportedInApi: true },
  { id: "o4-mini", displayName: "o4-mini", visibility: "list", supportedInApi: true },
];

export function createInitialCodexState(now: number = Date.now()): {
  accounts: CodexAccount[];
  usageCache: Record<string, DemoCodexUsageCacheEntry>;
  modelCache: Record<string, CodexModelCatalogCacheEntry>;
  modelPoolsV2: CodexModelPoolV2[];
  routerStatus: CodexRouterStatus;
} {
  const proResets = buildCodexResetCredits(now, "codex-pro", 2);
  const plusResets = buildCodexResetCredits(now, "codex-plus", 2);
  const teamResets = buildCodexResetCredits(now, "codex-team", 2);

  const accounts: CodexAccount[] = [
    {
      id: "codex-pro-main",
      label: "Pro Main",
      apiKey: "demo-codex-oauth-pro",
      lastPlan: "ChatGPT Pro",
      lastResets: "2",
      resetCredits: proResets,
      email: "alex.pro@acme-labs.dev",
      lastUsedAt: now - 4 * MIN_MS,
    },
    {
      id: "codex-plus-dev",
      label: "Plus Dev",
      apiKey: "demo-codex-oauth-plus",
      lastPlan: "ChatGPT Plus",
      lastResets: "2",
      resetCredits: plusResets,
      email: "dev.sandbox@acme-labs.dev",
      lastUsedAt: now - 35 * MIN_MS,
    },
    {
      id: "codex-team-ops",
      label: "Team Ops",
      apiKey: "demo-codex-oauth-team",
      lastPlan: "ChatGPT Business",
      lastResets: "2",
      resetCredits: teamResets,
      email: "ops-team@acme-labs.dev",
      lastUsedAt: now - 2 * HOUR_MS,
    },
  ];

  const usageCache: Record<string, DemoCodexUsageCacheEntry> = {
    "codex-pro-main": {
      isOAuth: true,
      planName: "ChatGPT Pro",
      fetchedAt: now - 20_000,
      resetCredits: proResets,
      rate_limit: {
        primary_window: {
          window_duration_mins: 300,
          used_percent: 22,
          reset_at: unixSec(now, 3.2 * HOUR_MS),
        },
        secondary_window: {
          window_duration_mins: 10080,
          used_percent: 34,
          reset_at: unixSec(now, 4.8 * DAY_MS),
        },
        reset_credits: proResets,
      },
    },
    "codex-plus-dev": {
      isOAuth: true,
      planName: "ChatGPT Plus",
      fetchedAt: now - 30_000,
      resetCredits: plusResets,
      rate_limit: {
        primary_window: {
          window_duration_mins: 300,
          used_percent: 68,
          reset_at: unixSec(now, 1.4 * HOUR_MS),
        },
        secondary_window: {
          window_duration_mins: 10080,
          used_percent: 54,
          reset_at: unixSec(now, 2.6 * DAY_MS),
        },
        reset_credits: plusResets,
      },
    },
    "codex-team-ops": {
      isOAuth: true,
      planName: "ChatGPT Business",
      fetchedAt: now - 35_000,
      resetCredits: teamResets,
      rate_limit: {
        primary_window: {
          window_duration_mins: 300,
          used_percent: 9,
          reset_at: unixSec(now, 4.6 * HOUR_MS),
        },
        secondary_window: {
          window_duration_mins: 10080,
          used_percent: 16,
          reset_at: unixSec(now, 6.2 * DAY_MS),
        },
        reset_credits: teamResets,
      },
    },
  };

  const modelCache: Record<string, CodexModelCatalogCacheEntry> = {
    "codex-pro-main": {
      accountId: "codex-pro-main",
      planName: "ChatGPT Pro",
      models: DEMO_CODEX_MODELS,
      fetchedAt: now - 10 * MIN_MS,
    },
    "codex-plus-dev": {
      accountId: "codex-plus-dev",
      planName: "ChatGPT Plus",
      models: DEMO_CODEX_MODELS.slice(1),
      fetchedAt: now - 12 * MIN_MS,
    },
    "codex-team-ops": {
      accountId: "codex-team-ops",
      planName: "ChatGPT Business",
      models: DEMO_CODEX_MODELS,
      fetchedAt: now - 15 * MIN_MS,
    },
  };

  const modelPoolsV2: CodexModelPoolV2[] = [
    {
      id: "pool-flagship",
      displayName: "Flagship Codex",
      publicModelName: "codex-flagship",
      upstreamModelId: "gpt-5.3-codex",
      enabled: true,
      memberAccountIds: ["codex-pro-main", "codex-team-ops"],
      modelSelectionMode: "discovered",
      routingPolicy: "cache-aware",
      authMode: "siwc",
      reasoningEffort: "high",
    },
    {
      id: "pool-fast",
      displayName: "Fast Mini",
      publicModelName: "codex-fast",
      upstreamModelId: "codex-mini",
      enabled: true,
      memberAccountIds: ["codex-plus-dev", "codex-team-ops"],
      modelSelectionMode: "discovered",
      routingPolicy: "balanced",
      authMode: "siwc",
      reasoningEffort: "medium",
    },
  ];

  const routerStatus: CodexRouterStatus = {
    running: true,
    baseUrl: "http://127.0.0.1:4319",
    port: 4319,
    uptimeSecs: 4820,
    inFlightRequests: 0,
    lastRoutedAccountId: "codex-pro-main",
    lastRoutedModel: "gpt-5.3-codex",
    routedRequestCount: 142,
    totalInputTokens: 1_840_200,
    totalOutputTokens: 214_600,
    totalCachedTokens: 1_190_400,
    totalReasoningTokens: 96_800,
    cacheHitRequests: 98,
    clientCoverage: { "Codex CLI": "Connected", "Claude Code": "Ready" },
  };

  return { accounts, usageCache, modelCache, modelPoolsV2, routerStatus };
}

const initial = createInitialCodexState();

export const INITIAL_CODEX_ACCOUNTS: CodexAccount[] = initial.accounts;
export const INITIAL_CODEX_USAGE_CACHE: Record<string, DemoCodexUsageCacheEntry> =
  initial.usageCache;
export const INITIAL_CODEX_MODEL_CACHE: Record<string, CodexModelCatalogCacheEntry> =
  initial.modelCache;
export const INITIAL_MODEL_POOLS_V2: CodexModelPoolV2[] = initial.modelPoolsV2;
export const DEMO_ROUTER_STATUS: CodexRouterStatus = initial.routerStatus;
