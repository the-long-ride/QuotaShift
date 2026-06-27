export interface QuotaData {
  model: string;
  percent: number;
  refreshTime: string;
  fiveHourPercent: number;
  fiveHourReset: string;
  fiveHourDisabled: boolean;
  weeklyPercent: number;
  weeklyReset: string;
  weeklyDisabled: boolean;
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

export interface FullStatus {
  credits: CreditInfo | null;
  quotas: QuotaData[];
  planTier: string | null;
  recentlyUsedModel: string | null;
  monitoredCodex: CodexMonitoredInfo | null;
  email?: string | null;
}

export interface CodexAccount {
  id: string;
  label: string;
  apiKey: string; // obfuscated in storage
  lastPlan?: string;
  lastResets?: string;
  email?: string;
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
  email?: string;
  lastQuotaFetchedAt?: number; // unix ms of last successful direct cloud quota fetch
  authMethod?: string;
  gcloudProjectId?: string; // GCP project ID for fallback quota (Service Usage + Monitoring)
  gcloudServiceName?: string; // GCP service name for fallback quota (e.g. generativelanguage.googleapis.com)
}
