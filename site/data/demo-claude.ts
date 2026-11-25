import type { ClaudeAccountUsageStatus, ClaudeMonitorStatus } from "../../src/utils/common/types";
import type { ClaudeResetCredits } from "../../src/utils/claude/claude-reset-credits";
import {
  firstVisiblePlatform,
  type PlatformId,
  type PlatformVisibility,
} from "../../src/utils/common/ui/platform-visibility";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MIN_MS = 60 * 1000;

const unixSec = (now: number, offsetMs: number): number => Math.floor((now + offsetMs) / 1000);
const isoAt = (now: number, offsetMs: number): string => new Date(now + offsetMs).toISOString();

export function createInitialClaudeState(now: number = Date.now()): {
  accountStatuses: ClaudeAccountUsageStatus[];
  monitorStatus: ClaudeMonitorStatus;
  resetCredits: Record<string, ClaudeResetCredits>;
} {
  const workFiveReset = unixSec(now, 3.6 * HOUR_MS);
  const workWeekReset = unixSec(now, 5.1 * DAY_MS);

  const accountStatuses: ClaudeAccountUsageStatus[] = [
    {
      account: {
        id: "claude-work",
        configDir: "~/.claude-work",
        profileName: "Work Max",
        subscriptionType: "max_20x",
        rateLimitTier: "default_claude_max_20x",
        expiresAt: now + 24 * DAY_MS,
        expired: false,
        email: "alex.rivera@acme-labs.dev",
        organizationName: "Acme Labs",
        source: "credentials",
      },
      fiveHour: { usedPercentage: 24, resetsAt: workFiveReset },
      sevenDay: { usedPercentage: 31, resetsAt: workWeekReset },
      usageFresh: true,
      usageFetchedAt: now - 18_000,
      active: true,
      lastUsedAt: now - 2 * MIN_MS,
      suspended: false,
      suspendedProcessCount: 0,
      error: null,
    },
    {
      account: {
        id: "claude-oss",
        configDir: "~/.claude-oss",
        profileName: "OSS Pro",
        subscriptionType: "pro",
        rateLimitTier: "default_claude_pro",
        expiresAt: now + 19 * DAY_MS,
        expired: false,
        email: "alex@openbuild.org",
        organizationName: "OpenBuild",
        source: "credentials",
      },
      fiveHour: { usedPercentage: 78, resetsAt: unixSec(now, 1.3 * HOUR_MS) },
      sevenDay: { usedPercentage: 52, resetsAt: unixSec(now, 3.2 * DAY_MS) },
      usageFresh: true,
      usageFetchedAt: now - 24_000,
      active: false,
      lastUsedAt: now - 26 * MIN_MS,
      suspended: false,
      suspendedProcessCount: 0,
      error: null,
    },
    {
      account: {
        id: "claude-research",
        configDir: "~/.claude-research",
        profileName: "Research Max",
        subscriptionType: "max_5x",
        rateLimitTier: "default_claude_max_5x",
        expiresAt: now + 21 * DAY_MS,
        expired: false,
        email: "research@acme-labs.dev",
        organizationName: "Acme Research",
        source: "credentials",
      },
      fiveHour: { usedPercentage: 92, resetsAt: unixSec(now, 0.8 * HOUR_MS) },
      sevenDay: { usedPercentage: 64, resetsAt: unixSec(now, 2.4 * DAY_MS) },
      usageFresh: true,
      usageFetchedAt: now - 45_000,
      active: false,
      lastUsedAt: now - 9 * MIN_MS,
      suspended: true,
      suspendedProcessCount: 1,
      error: null,
    },
  ];

  const monitorStatus: ClaudeMonitorStatus = {
    installed: true,
    settingsPath: "~/.claude/settings.json",
    source: "statusLine",
    session: {
      sessionId: "demo-claude-session-01",
      sessionName: "quotashift-demo",
      modelId: "claude-opus-4-6",
      modelDisplayName: "Claude Opus 4.6",
      claudeCodeVersion: "2.1.14",
      currentDir: "~/workspace/quotashift",
      projectDir: "~/workspace/quotashift",
      capturedAtMs: now - 15_000,
      totalCostUsd: 1.42,
      totalDurationMs: 420_000,
      totalApiDurationMs: 84_000,
      totalInputTokens: 128_400,
      totalOutputTokens: 19_200,
      contextWindowSize: 200_000,
      contextUsedPercentage: 36,
      contextRemainingPercentage: 64,
      currentInputTokens: 64_200,
      currentOutputTokens: 7_800,
      cacheCreationInputTokens: 18_400,
      cacheReadInputTokens: 92_100,
      fiveHour: { usedPercentage: 24, resetsAt: workFiveReset },
      sevenDay: { usedPercentage: 31, resetsAt: workWeekReset },
    },
    localUsage: {
      fiveHour: {
        requestCount: 38,
        inputTokens: 128_400,
        outputTokens: 19_200,
        cacheCreationInputTokens: 18_400,
        cacheReadInputTokens: 92_100,
        processedTokens: 258_100,
      },
      sevenDay: {
        requestCount: 312,
        inputTokens: 1_140_000,
        outputTokens: 182_000,
        cacheCreationInputTokens: 164_000,
        cacheReadInputTokens: 890_000,
        processedTokens: 2_376_000,
      },
      capturedAtMs: now - 15_000,
    },
    error: null,
  };

  const workNearest = isoAt(now, 8 * DAY_MS + 3 * HOUR_MS);
  const ossNearest = isoAt(now, 11 * DAY_MS + 6 * HOUR_MS);

  const resetCredits: Record<string, ClaudeResetCredits> = {
    "claude-work": {
      status: "available",
      count: 2,
      grants: [
        { resetsLeft: 1, expiresAt: workNearest },
        { resetsLeft: 1, expiresAt: isoAt(now, 16 * DAY_MS) },
      ],
      nearestExpiresAt: workNearest,
      reason: null,
      fetchedAt: now - 30_000,
    },
    "claude-oss": {
      status: "available",
      count: 1,
      grants: [{ resetsLeft: 1, expiresAt: ossNearest }],
      nearestExpiresAt: ossNearest,
      reason: null,
      fetchedAt: now - 30_000,
    },
    "claude-research": {
      status: "none",
      count: 0,
      grants: [],
      nearestExpiresAt: null,
      reason: null,
      fetchedAt: now - 30_000,
    },
  };

  return { accountStatuses, monitorStatus, resetCredits };
}

const initial = createInitialClaudeState();

export const INITIAL_CLAUDE_ACCOUNT_STATUSES: ClaudeAccountUsageStatus[] = initial.accountStatuses;
export const DEMO_CLAUDE_MONITOR_STATUS: ClaudeMonitorStatus = initial.monitorStatus;
export const INITIAL_CLAUDE_RESET_CREDITS: Record<string, ClaudeResetCredits> =
  initial.resetCredits;

export function markClaudeRefreshed(
  statuses: ClaudeAccountUsageStatus[],
  accountId: string,
  now: number = Date.now(),
): ClaudeAccountUsageStatus[] {
  return statuses.map((s) => (s.account.id === accountId ? { ...s, usageFetchedAt: now } : s));
}

export function resumeClaudeByConfigDir(
  statuses: ClaudeAccountUsageStatus[],
  configDir: string,
): ClaudeAccountUsageStatus[] {
  return statuses.map((s) =>
    s.account.configDir === configDir ? { ...s, suspended: false, suspendedProcessCount: 0 } : s,
  );
}

export function renameClaudeStatus(
  statuses: ClaudeAccountUsageStatus[],
  accountId: string,
  newAlias: string,
): ClaudeAccountUsageStatus[] {
  const profileName = newAlias.trim();
  if (!profileName) return statuses;
  return statuses.map((s) =>
    s.account.id === accountId ? { ...s, account: { ...s.account, profileName } } : s,
  );
}

export function readInitialDemoTheme(): boolean {
  try {
    return localStorage.getItem("quotashift_theme") !== "light";
  } catch {
    return true;
  }
}

export function syncDemoThemeDom(isDarkMode: boolean): void {
  document.documentElement.setAttribute("data-theme", isDarkMode ? "dark" : "light");
  try {
    localStorage.setItem("quotashift_theme", isDarkMode ? "dark" : "light");
  } catch {}
}

export function toggleSetItem(prev: Set<string>, id: string, include: boolean): Set<string> {
  const next = new Set(prev);
  if (include) next.add(id);
  else next.delete(id);
  return next;
}

export function makeScanProgress(total: number, running: boolean) {
  return {
    running,
    total,
    completed: running ? 0 : total,
    succeeded: running ? 0 : total,
    failed: 0,
  };
}

export function applyVisibilityChange(
  prev: { platformVisibility: PlatformVisibility; activeTab: PlatformId },
  platform: PlatformId,
  visible: boolean,
): { platformVisibility: PlatformVisibility; activeTab: PlatformId } {
  const platformVisibility: PlatformVisibility = {
    ...prev.platformVisibility,
    [platform]: visible,
  };
  const fallback =
    !visible && prev.activeTab === platform ? firstVisiblePlatform(platformVisibility) : null;
  return { platformVisibility, activeTab: fallback ?? prev.activeTab };
}

export function updateRecordEntry<T>(
  record: Record<string, T>,
  key: string,
  updater: (prev: T) => T,
): Record<string, T> {
  return key in record ? { ...record, [key]: updater(record[key]) } : record;
}
