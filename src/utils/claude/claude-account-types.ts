import type { ClaudeRateLimitWindow } from "../common/types";

export interface ClaudeAccount {
  id: string;
  configDir: string;
  profileName: string;
  subscriptionType: string | null;
  rateLimitTier: string | null;
  expiresAt: number | null;
  expired: boolean | null;
  email: string | null;
  organizationName: string | null;
  source: string;
}

export interface ClaudeAccountUsageStatus {
  account: ClaudeAccount;
  fiveHour: ClaudeRateLimitWindow | null;
  sevenDay: ClaudeRateLimitWindow | null;
  usageFresh: boolean;
  usageFetchedAt: number | null;
  active?: boolean;
  lastUsedAt?: number | null;
  suspended: boolean;
  suspendedProcessCount: number;
  error: string | null;
}
